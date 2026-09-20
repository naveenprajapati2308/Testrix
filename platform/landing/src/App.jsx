import { ThemeProvider } from './context/ThemeContext';
import ParticleCanvas from './components/ParticleCanvas';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Products from './components/Products';
import Features from './components/Features';
import Architecture from './components/Architecture';
import Stats from './components/Stats';
import WhyTestrix from './components/WhyTestrix';
import CTA from './components/CTA';
import Footer from './components/Footer';

/* ═══════════════════════════════════════════════════════════════════════
   APP — Testrix Landing Page with Global Particle Canvas & Theme Provider
   ═══════════════════════════════════════════════════════════════════════ */

export default function App() {
  return (
    <ThemeProvider>
      {/* Global persistent floating bubble & particle canvas behind all content */}
      <ParticleCanvas />
      <Navbar />
      <Hero />
      <Products />
      <Features />
      <Architecture />
      <Stats />
      <WhyTestrix />
      <CTA />
      <Footer />
    </ThemeProvider>
  );
}
