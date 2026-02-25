class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.1.11"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.11/askkaya-darwin-arm64"
      sha256 "72d57123faf07d6bbd13917eb8ad2755cd6226f7f46ff25970f2dd8b723e9bed"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.11/askkaya-darwin-amd64"
      sha256 "a0d36d4bccf1fc592e8c8b1748dc9ca30bdd26b030c075255216f0b01a498260"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.11/askkaya-linux-arm64"
      sha256 "3bd6cba6116f7ff970fd8421c98557647471a875bd84ef499bb79c919acdf25b"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.11/askkaya-linux-amd64"
      sha256 "7cdaa857f60c1b658e8463a4db8af83f56863c21afc44b2e93eeafb30d1555da"
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
