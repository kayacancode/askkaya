class Askkaya < Formula
  desc "AskKaya - Full-stack client support platform CLI"
  homepage "https://github.com/kayacancode/askkaya"
  version "0.2.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.2/askkaya-darwin-arm64"
      sha256 "c27c2426bc82f998b1bee0eb06870ed41e45220190f52c21aa2057622f2cfde8"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.2/askkaya-darwin-amd64"
      sha256 "483b296b3f4dcc96f76d80ba5aa025b94df54dcece647d6ef81960efe0c11a82"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.2/askkaya-linux-arm64"
      sha256 "2f46dd0368c3730282d64ec2ca2809d7a1b1c20191420f92bc80bc5a213235d1"
    else
      url "https://github.com/kayacancode/askkaya/releases/download/v0.2.2/askkaya-linux-amd64"
      sha256 "a5bd43adbdc891f6333259c9d21826d242e5d2a2bc54bb4ff54ce50a3d42c987"
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
