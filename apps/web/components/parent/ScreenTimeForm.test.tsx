import type { ScreenTimeSettingResponse } from "@kidlearn/types";
import { ScreenTimeUpdateSchema } from "@kidlearn/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { Providers } from "@/components/Providers";
import type { ApiResult } from "@/lib/api-client";
import { resetI18nForTests } from "@/lib/i18n";
import { ScreenTimeForm } from "./ScreenTimeForm";

const OFF: ScreenTimeSettingResponse = {
  dailyLimitMinutes: null,
  windowStart: null,
  windowEnd: null,
};

type SubmitSpy = Mock<
  (values: unknown) => Promise<ApiResult<ScreenTimeSettingResponse>>
>;

function renderForm(
  initial: ScreenTimeSettingResponse = OFF,
  onSubmit: SubmitSpy = vi.fn(async () => ({
    ok: true as const,
    data: initial,
  })),
) {
  const onSaved = vi.fn();
  render(
    <Providers locale="en">
      <ScreenTimeForm
        childName="Ayaan"
        initial={initial}
        onSubmit={onSubmit}
        onSaved={onSaved}
      />
    </Providers>,
  );
  return { onSubmit, onSaved };
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
}

beforeEach(() => {
  resetI18nForTests();
});

describe("ScreenTimeForm", () => {
  it("shows the limit picker with 'Off' selected when no limit is set", () => {
    renderForm();

    expect(screen.getByRole("radio", { name: "Off" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "30 min" })).not.toBeChecked();
  });

  it("preselects the stored limit", () => {
    renderForm({ ...OFF, dailyLimitMinutes: 45 });

    expect(screen.getByRole("radio", { name: "45 min" })).toBeChecked();
  });

  it("hides the time inputs until the window toggle is on", () => {
    renderForm();

    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Only allow learning between set times",
      }),
    );

    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("Until")).toBeInTheDocument();
  });

  it("shows a stored window with the toggle already on", () => {
    renderForm({
      dailyLimitMinutes: 30,
      windowStart: "08:15",
      windowEnd: "18:45",
    });

    expect(
      screen.getByRole("checkbox", {
        name: "Only allow learning between set times",
      }),
    ).toBeChecked();
    expect(screen.getByLabelText("From")).toHaveValue("08:15");
    expect(screen.getByLabelText("Until")).toHaveValue("18:45");
  });

  it("submits a limit with both window ends null when the toggle is off", async () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "30 min" }));
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      dailyLimitMinutes: 30,
      windowStart: null,
      windowEnd: null,
    });
  });

  it("submits both window ends together", async () => {
    const { onSubmit } = renderForm();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Only allow learning between set times",
      }),
    );
    fireEvent.change(screen.getByLabelText("From"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("Until"), {
      target: { value: "17:30" },
    });
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      dailyLimitMinutes: null,
      windowStart: "09:00",
      windowEnd: "17:30",
    });
  });

  /**
   * The point of validating with the server's own schema rather than a local copy:
   * whatever this form can produce is something `PATCH` accepts.
   */
  it("submits a payload the server's schema accepts", async () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("radio", { name: "90 min" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Only allow learning between set times",
      }),
    );
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(
      ScreenTimeUpdateSchema.safeParse(onSubmit.mock.calls[0][0]).success,
    ).toBe(true);
  });

  it("clears a stored policy when the parent switches everything off", async () => {
    const { onSubmit } = renderForm({
      dailyLimitMinutes: 60,
      windowStart: "07:00",
      windowEnd: "19:00",
    });

    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Only allow learning between set times",
      }),
    );
    submit();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({
      dailyLimitMinutes: null,
      windowStart: null,
      windowEnd: null,
    });
  });

  it("keeps the parent's times when the toggle is switched off and on again", () => {
    renderForm({
      dailyLimitMinutes: null,
      windowStart: "06:30",
      windowEnd: "20:15",
    });
    const toggle = screen.getByRole("checkbox", {
      name: "Only allow learning between set times",
    });

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    expect(screen.getByLabelText("From")).toHaveValue("06:30");
    expect(screen.getByLabelText("Until")).toHaveValue("20:15");
  });

  /** The server reads an equal pair as "no window"; the parent is told before saving. */
  it("warns when both window times are the same", () => {
    renderForm({
      dailyLimitMinutes: null,
      windowStart: "08:00",
      windowEnd: "08:00",
    });

    expect(
      screen.getByText("The two times are the same, so no window is applied."),
    ).toBeInTheDocument();
  });

  it("reports a failed save without claiming it succeeded", async () => {
    const onSubmit: SubmitSpy = vi.fn(async () => ({
      ok: false as const,
      error: { code: "INTERNAL" as const, message: "boom" },
    }));
    const { onSaved } = renderForm(OFF, onSubmit);

    submit();

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("hands the saved settings to onSaved", async () => {
    const saved: ScreenTimeSettingResponse = {
      dailyLimitMinutes: 15,
      windowStart: null,
      windowEnd: null,
    };
    const onSubmit: SubmitSpy = vi.fn(async () => ({
      ok: true as const,
      data: saved,
    }));
    const { onSaved } = renderForm(OFF, onSubmit);

    fireEvent.click(screen.getByRole("radio", { name: "15 min" }));
    submit();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });
});
