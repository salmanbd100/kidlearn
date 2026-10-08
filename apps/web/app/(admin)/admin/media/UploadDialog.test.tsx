import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UploadDialog } from "./UploadDialog";

const api = vi.hoisted(() => ({
  signMediaUpload: vi.fn(),
  uploadToCloudinary: vi.fn(),
  registerMediaAsset: vi.fn(),
}));

vi.mock("@/features/admin/media-api", () => api);

const URL = "https://res.cloudinary.com/demo/video/upload/count.mp3";

beforeEach(() => {
  api.signMediaUpload.mockReset();
  api.uploadToCloudinary.mockReset();
  api.registerMediaAsset.mockReset();
  api.signMediaUpload.mockResolvedValue({ ok: true, data: {} });
  api.uploadToCloudinary.mockResolvedValue({ ok: true, url: URL });
  api.registerMediaAsset.mockResolvedValue({ ok: true, data: {} });
});

function choose(field: string, option: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: field }), {
    key: "Enter",
  });
  fireEvent.click(screen.getByRole("option", { name: option }));
}

function pickFile() {
  fireEvent.change(screen.getByLabelText("File"), {
    target: {
      files: [new File(["clip"], "count.mp3", { type: "audio/mpeg" })],
    },
  });
}

describe("UploadDialog", () => {
  it("records the kind and the language chosen from the dropdowns", async () => {
    const onUploaded = vi.fn();
    render(<UploadDialog onUploaded={onUploaded} />);

    choose("Kind", "Audio");
    choose("Language", "Bangla");
    pickFile();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(api.signMediaUpload).toHaveBeenCalledWith("audio");
    expect(api.registerMediaAsset).toHaveBeenCalledWith({
      url: URL,
      kind: "audio",
      language: "bn",
    });
  });

  it("records no language when it is left not set", async () => {
    const onUploaded = vi.fn();
    render(<UploadDialog onUploaded={onUploaded} />);

    choose("Kind", "Audio");
    choose("Language", "Bangla");
    choose("Language", "Not set");
    pickFile();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalled());
    expect(api.registerMediaAsset.mock.calls[0][0].language).toBeNull();
  });

  it("asks no language of an image", () => {
    render(<UploadDialog onUploaded={vi.fn()} />);

    expect(
      screen.queryByRole("combobox", { name: "Language" }),
    ).not.toBeInTheDocument();
  });
});
