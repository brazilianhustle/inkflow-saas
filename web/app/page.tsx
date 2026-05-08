import Nav from "@/components/landing/Nav";
import Hero from "@/components/landing/Hero";
import Stats from "@/components/landing/Stats";
import Features from "@/components/landing/Features";
import HowItWorks from "@/components/landing/HowItWorks";
import Demo from "@/components/landing/Demo";
import Pricing from "@/components/landing/Pricing";
import Faq from "@/components/landing/Faq";

export default function Home() {
  return (
    <main>
      <Nav />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Demo />
      <Pricing />
      <Faq />
    </main>
  );
}
