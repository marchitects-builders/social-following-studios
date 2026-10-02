# Social Following Studios design contract

The existing OWN YOUR AUDIENCE wireframe, positioning, navigation architecture, and Claude-authored visual direction are the source of truth. This is a restoration and refinement, not a redesign. Current implementation is an isolated Next.js branch; production remains unchanged until visual and route QA pass.

## Visual system

- Warm cream canvas, soft paper surfaces, restrained evergreen signal color, and near-black editorial type. No generic SaaS gradients, agency cards, or library collage.
- Cormorant Garamond for large editorial statements; DM Sans for interface and body copy. Strong hierarchy with readable labels.
- Floating compact navigation. Mobile opens into a full-screen cream navigation, with keyboard Escape and reduced-motion support.
- The Audience Graph is the essential system visualization. Its structure must be visible before, during, and after animation. Motion explains flow; it must never gate content visibility.
- Assessment Summary should read like an instrument panel describing actual outputs, not fabricated metrics or an analytics mockup.
- Keep legacy hash routes and direct-access pages functional during migration.

## Recovery hierarchy

1. The Claude-approved Social Following Studios build is the visual baseline: palette, typography, proportions, assessment dashboard, audience graph, forms, integrations, navigation, and responsive behavior.
2. UI/UX Pro Max informs responsive composition and accessibility only; it cannot replace the approved system.
3. 21st.dev Magic and Magic UI are optional component refinements after existing approved components are reused. Never paste generated UI wholesale or introduce a new visual language.
4. shadcn/ui remains the primitive foundation; Framer Motion is limited to meaningful dashboard, graph, navigation, hover, and reduced-motion-safe interactions.
5. Taste and Impeccable are critique gates, followed by DESIGN.md conformance and Playwright visual, interaction, route, console, and viewport verification.
6. img2threejs is only permitted if an approved 3D treatment must be restored. It is not a redesign tool.

## Homepage contract

Hero: FULL-SERVICE ESP, “Own your audience.”, full-service ESP plus deployment layer, “We build and run unified conversion systems,” assessment dashboard at right. The lower Audience Asset section contains the animated node graph. Keep them separate.

Homepage sequence: category contrast; Infrastructure / Deployment / Operation; unified conversion flow; managed work; lifecycle; database reactivation; deliverability; channel orchestration; Audience Asset graph; industries; verified operating record; Assessment / Architecture / Deployment / Operation; insights; about; final assessment CTA.

## Motion rules

Framer Motion is used for graph flow, mobile navigation, and restrained micro-interactions. Favor short transitions, subtle distance, and a non-animated reduced-motion state. Avoid gratuitous parallax, constant looping, or decorative 3D.

## Release gate

Before deployment: Playwright checks at desktop, tablet, and mobile widths; inspect homepage, What We Do, Audience Builder, Proof, Assessment, Contact, hidden/direct-access pages, overflow, typography, graph visibility, nav and menu behavior. Review actual screenshots before claiming visual completion. No production change until this gate passes.
