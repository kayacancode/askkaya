class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.1.10"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.10/askkaya-darwin-arm64"
      sha256 "4b0599ff5490b5501828b876725258ba72816cbe70e0ad7088bb6356c3149443"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.10/askkaya-darwin-amd64"
      sha256 "84904942f98200d7d7ac76495c6a7aaadfd14b5bd5d0307cc0038abf6d46abb4"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.10/askkaya-linux-arm64"
      sha256 "ca838f630e520d56a594048f98d67dbffd39a2c2ffabcce99ae35bd9a2849ae4"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.1.10/askkaya-linux-amd64"
      sha256 "a720c3290e9132c30e23010e0c1f0a4244a53f576388fb303782799790c7529d"
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
