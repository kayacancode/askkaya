class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.2.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.0/askkaya-darwin-arm64"
      sha256 "9373ce6d2cecf03921c883fce6ebdcf91bab9729c71c9948e154ecf74ad0c02e"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.0/askkaya-darwin-amd64"
      sha256 "9fa21033c5b2150aba338739d293800b0afeb84cb028e69de501087413cea5f1"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.0/askkaya-linux-arm64"
      sha256 "c72f071c3de353ec225fe3efb4689dfb79bed69321b6aaead27a06e4f4a0c7bf"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.0/askkaya-linux-amd64"
      sha256 "36e1ed278c5c4898ffb165fcfc7d9201523c107f09a4bb86a43c404b5e931896"
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
