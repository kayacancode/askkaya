class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.2.7"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.7/askkaya-darwin-arm64"
      sha256 "6a834e6226ff16d41b76137caf6b786d94d0c214e546f05ac496d65cad684d20"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.7/askkaya-darwin-amd64"
      sha256 "5aa000123c7a38bb3c40d495cfbc686ceab9beb47d9ea3b8a2ee32fc171519cb"
    end
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "askkaya-darwin-arm64" => "askkaya"
      else
        bin.install "askkaya-darwin-amd64" => "askkaya"
      end
    end
  end

  test do
    system "#{bin}/askkaya", "--version"
  end
end
