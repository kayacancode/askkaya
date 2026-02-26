class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.2.3"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.3/askkaya-darwin-arm64"
      sha256 "d2403e6c706530450342334ccb363610ec42905a8d4aa10a4944597b4f29f234"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.3/askkaya-darwin-amd64"
      sha256 "27960dbdcf53e4b1cb51c0ebfbbddc8ea5d314e243d133aa2231d75c8820893a"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.3/askkaya-linux-arm64"
      sha256 "e1f721fbe0f0652233ef268d957feb2241c9a6762623c9dcd5851a08b6681336"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.3/askkaya-linux-amd64"
      sha256 "cc96d6bd553a8cf32509a5af47596794b324eff247ee0bebdd050fbdec8e3286"
    end
  end

  def install
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "askkaya-darwin-arm64" => "askkaya"
      else
        bin.install "askkaya-darwin-amd64" => "askkaya"
      end
    elsif OS.linux?
      if Hardware::CPU.arm?
        bin.install "askkaya-linux-arm64" => "askkaya"
      else
        bin.install "askkaya-linux-amd64" => "askkaya"
      end
    end
  end

  test do
    system "#{bin}/askkaya", "--version"
  end
end
