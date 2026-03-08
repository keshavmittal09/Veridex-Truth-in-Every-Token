'use client';

export default function HeroSection() {
    return (
        <section className="hero">
            <p className="hero-tagline">Truth in Every Token</p>
            <h1 className="hero-title">
                Don't Trust AI.<br />
                <span>Verify It.</span>
            </h1>
            <p className="hero-desc">
                Veridex decomposes AI-generated text into atomic claims and cross-checks each one
                against authoritative sources — Wikipedia, Wikidata, PubMed, SEC EDGAR,
                CourtListener, and Google Fact Check — in real-time.
            </p>
        </section>
    );
}
