import { HeroSection } from "@/components/landing/HeroSection"
import { BentoGrid } from "@/components/landing/BentoGrid"
import { Footer } from "@/components/landing/Footer"

export default function Home() {
  return (
    <main className="min-h-screen font-sans bg-black selection:bg-white selection:text-black">
      <HeroSection />
      <BentoGrid />
      <Footer />
    </main>
  )
}
