import Image from "next/image";

export default function Layout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="w-full lg:grid lg:min-h-[100vh] lg:grid-cols-2">
      <div className="flex items-center justify-center py-12">
        <div className="mx-auto grid w-[370px] gap-6">{children}</div>
      </div>
      <div className="hidden bg-[#f3c3b3] lg:block relative overflow-hidden">
        {/* Grid SVG - Top Right */}
        <div className="absolute top-0 right-0 z-10">
          <Image
            src="/grid-01.svg"
            alt=""
            width={450}
            height={254}
            className="opacity-30"
          />
        </div>

        {/* Grid SVG - Bottom Left */}
        <div className="absolute bottom-0 left-0 z-10">
          <Image
            src="/grid-01.svg"
            alt=""
            width={450}
            height={254}
            className="opacity-30"
          />
        </div>

        {/* Content Container */}
        <div className="relative h-full w-full flex items-center justify-center z-20">
          {/* Logo in Center */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Image
              src="/logo.webp"
              alt="SimpleChat Logo"
              width={120}
              height={120}
              className="object-contain"
            />
          </div>

          {/* SimpleChat Text on Right */}
          <div className="absolute right-8">
            <h2 className="text-4xl font-bold text-foreground">SimpleChat</h2>
          </div>
        </div>
      </div>
    </div>
  );
}
