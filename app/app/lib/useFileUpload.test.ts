import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, fileProblem, kindOf, maxSize } from "./useFileUpload";

const MB = 1024 * 1024;

function file(type: string, bytes = 1000): Blob {
  return { type, size: bytes } as Blob;
}

describe("kindOf", () => {
  it("reads the kind off the file's type", () => {
    expect(kindOf(file("image/jpeg"))).toBe("image");
    expect(kindOf(file("video/mp4"))).toBe("video");
    expect(kindOf(file("audio/mpeg"))).toBe("audio");
  });

  it("has no kind for anything else, or no type at all", () => {
    expect(kindOf(file("application/pdf"))).toBeNull();
    expect(kindOf(file(""))).toBeNull();
  });
});

describe("fileProblem", () => {
  it("lets a file through when the picker takes it and it fits", () => {
    expect(fileProblem(file("image/png"), ["image"])).toBeNull();
    expect(fileProblem(file("video/mp4", MAX_UPLOAD_BYTES.video), ["image", "video"])).toBeNull();
  });

  it("names what the picker takes", () => {
    expect(fileProblem(file("application/pdf"), ["image"])).toBe("Choose a picture.");
    expect(fileProblem(file("audio/mpeg"), ["image", "video"])).toBe("Choose a picture or video.");
    expect(fileProblem(file(""), ["image", "video", "audio"])).toBe("Choose a picture, video or audio file.");
    expect(fileProblem(file("image/png"), ["audio"])).toBe("Choose an audio file.");
  });

  it("gives the cap for a file that's too big", () => {
    expect(fileProblem(file("image/jpeg", 13 * MB), ["image"])).toBe("Pictures up to 12 MB.");
    expect(fileProblem(file("audio/wav", 65 * MB), ["audio"])).toBe("Audio files up to 64 MB.");
  });

  it("says to paste a link for big video or audio when the form takes links", () => {
    expect(fileProblem(file("video/mp4", 65 * MB), ["video"], true)).toBe(
      "Videos up to 64 MB. For a longer one, paste its link.",
    );
    // A picture is never "longer", so it gets the plain cap.
    expect(fileProblem(file("image/jpeg", 13 * MB), ["image"], true)).toBe("Pictures up to 12 MB.");
  });

  it("takes a full-size phone photo", () => {
    expect(fileProblem(file("image/jpeg", 8 * MB), ["image"])).toBeNull();
  });
});

describe("maxSize", () => {
  it("reads as people say it", () => {
    expect(maxSize("image")).toBe("12 MB");
    expect(maxSize("video")).toBe("64 MB");
  });
});
