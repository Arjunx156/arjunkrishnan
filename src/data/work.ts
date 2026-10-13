// Every number here comes from the résumé or the project's own README.

export type Figure = "voice" | "fusion" | "charge" | "relief" | "intercept" | "spike";

export interface Link {
  label: string;
  href: string;
}

export interface Metric {
  value: string;
  label: string;
}

export interface Project {
  id: string;
  title: string;
  kind: string;
  year: string;
  lede: string;
  body: string;
  metrics: Metric[];
  stack: string[];
  links: Link[];
  figure: Figure;
  figureAlt: string;
  caption: string;
}

export interface Chapter {
  id: string;
  title: string;
  note: string;
  scene: "orb" | "terrain" | "knot"; // what the particles become on the chapter's title card
  sceneNote: string;
  projects: Project[];
}

export interface Note {
  title: string;
  year: string;
  line: string;
  links: Link[];
}

export const chapters: Chapter[] = [
  {
    id: "systems",
    title: "Systems",
    note: "LLM software that has to run, stream and stay up.",
    scene: "orb",
    sceneNote: "Behind this: a sphere that ripples like a voice.",
    projects: [
      {
        id: "voicecare",
        title: "VoiceCare AI",
        kind: "Voice-first customer support",
        year: "2026",
        lede: "Speak your problem in your own language. Hear the fix back in under ten seconds.",
        body: "A customer taps one button and talks. Nine LangGraph agents take it from there: speech to text, intent, order lookup, policy retrieval, a resolution, six hard escalation rules, a reply, speech again and a ticket. It all streams over one WebSocket, and every step can be replayed from the admin dashboard.",
        metrics: [
          { value: "<10 s", label: "spoken resolution" },
          { value: "9", label: "languages" },
          { value: "90%", label: "intent accuracy, 35 conversations" },
          { value: "57", label: "unit tests passing" },
        ],
        stack: [
          "LangGraph",
          "Gemini 2.5",
          "Bhashini",
          "FastAPI",
          "Next.js",
          "ChromaDB",
          "Neon Postgres",
          "Upstash Redis",
        ],
        links: [
          { label: "Live demo", href: "https://frontend-roan-three-65.vercel.app" },
          { label: "Source", href: "https://github.com/Arjunx156/VoiceCare-AI" },
        ],
        figure: "voice",
        caption: "One call through all nine agents, against the ten-second budget.",
        figureAlt:
          "Animated diagram: a caller speaks, the request hops through nine agents from speech to text to ticket, each printing its output, and a timer fills a ten-second budget.",
      },
      {
        id: "rag",
        title: "Hybrid RAG engine",
        kind: "Retrieval-augmented generation",
        year: "2026",
        lede: "Keyword search and vector search vote, then a cross-encoder picks what the model gets to read.",
        body: "BM25 and dense retrieval are fused with Reciprocal Rank Fusion, and an MS MARCO cross-encoder reranks the survivors. Answers stream with page-level citations. One environment variable swaps OpenAI for a local Ollama model, and embeddings and reranking already run offline, so it can work at zero cost per token.",
        metrics: [
          { value: "84%", label: "Precision@5, up from a 68% baseline" },
          { value: "48", label: "pytest tests" },
          { value: "$0", label: "per token, fully local" },
        ],
        stack: ["FastAPI", "ChromaDB", "sentence-transformers", "Ollama", "Streamlit", "pytest"],
        links: [
          { label: "Docs", href: "https://arjunx156.github.io/rag-system/" },
          { label: "Source", href: "https://github.com/Arjunx156/rag-system" },
        ],
        figure: "fusion",
        caption: "BM25 and dense rankings fused by RRF, reranked, then measured.",
        figureAlt:
          "Animated diagram: a keyword ranking and a vector ranking merge into one list by reciprocal rank fusion, a cross-encoder reorders it, the top five are marked, and precision at five rises from 0.68 to 0.84.",
      },
    ],
  },
  {
    id: "research",
    title: "Research",
    note: "Two co-authored papers, with the failures written down too.",
    scene: "terrain",
    sceneNote: "Behind this: a loss landscape, and one path down into its deepest basin.",
    projects: [
      {
        id: "battery",
        title: "Intelligent battery management for IoT nodes",
        kind: "Published paper, co-author",
        year: "2025",
        lede: "Predicting a battery's state of charge, and admitting where the model gets unsure.",
        body: "We raced sequence models on 19,735 IoT battery readings, split by time so the future never leaked into training. A four-head attention BiLSTM reached R² 0.9958. Monte Carlo dropout showed where confidence drops: while charging, where the voltage curve stops being monotonic. The battery-health heads scored a negative R², and that went into the paper too.",
        metrics: [
          { value: "0.9958", label: "R², state of charge" },
          { value: "1.48", label: "RMSE, beating BiLSTM's 1.61" },
          { value: "19,735", label: "sensor readings" },
        ],
        stack: ["TensorFlow", "Keras", "BiLSTM", "Multi-head attention", "LSTM autoencoder", "SMOTE"],
        links: [],
        figure: "charge",
        caption: "Held-out state of charge, Monte Carlo dropout doubt, and four attention heads.",
        figureAlt:
          "Animated chart: predicted state of charge tracks the true curve, an uncertainty band widens while charging, and a heatmap shows where four attention heads look.",
      },
      {
        id: "relief",
        title: "Emergency resource allocation for Delhi",
        kind: "Research paper, co-author",
        year: "2026",
        lede: "800 units of relief, 910 units of need, five districts. Who gets what, and how fast?",
        body: "We benchmarked four optimisers on the shortfall. Urgency-weighted proximal gradient won, with a penalty weight that gives planners a dial between critical medical supply and routine food. 200 Monte Carlo runs checked it. Dynamic Mode Decomposition flags blocked routes on its own, and service bends from 0.963 to 0.941 instead of collapsing.",
        metrics: [
          { value: "0.963", label: "urgency-weighted fulfilment" },
          { value: "200", label: "Monte Carlo runs" },
          { value: "<4.8%", label: "DMD reconstruction error" },
        ],
        stack: ["MATLAB", "Proximal gradient", "ADMM", "Dynamic Mode Decomposition", "Monte Carlo"],
        links: [],
        figure: "relief",
        caption: "Need, supply, the penalty dial, and the eigenvalue that flags a blocked route.",
        figureAlt:
          "Animated map: relief flows from a depot to five districts, a penalty dial shifts supply toward medical need, a route is blocked, one eigenvalue leaves the unit circle, and service drops from 0.963 to 0.941.",
      },
    ],
  },
  {
    id: "security",
    title: "Security",
    note: "Break it first, then fix it properly.",
    scene: "knot",
    sceneNote: "Behind this: a trefoil knot, one closed loop, like the group Diffie-Hellman lives in.",
    projects: [
      {
        id: "mitm",
        title: "Man-in-the-middle on Diffie-Hellman",
        kind: "Attack and defence simulator",
        year: "2026",
        lede: "Two people agree on a secret key. A third quietly holds both copies.",
        body: "Mallory swaps both public values, derives two session keys and relays every message, so the session keeps working and nobody notices. Every primitive is hand-written with no crypto library: Miller-Rabin, square-and-multiply, extended Euclid, 512-bit RSA. Then a certificate authority signs the keys and the forgery fails. The maths was fine all along. The handshake just never checked who was on the other end.",
        metrics: [
          { value: "0", label: "crypto libraries used" },
          { value: "512-bit", label: "RSA keys, generated from scratch" },
          { value: "10", label: "Miller-Rabin rounds per prime" },
        ],
        stack: ["Python", "Miller-Rabin", "RSA", "PKI", "http.server", "JavaScript"],
        links: [],
        figure: "intercept",
        caption: "The interception in six steps, and the signature that ends it.",
        figureAlt:
          "Animated sequence: Mallory intercepts and swaps both Diffie-Hellman public values, ends up holding two keys, then a certificate authority signs the keys and her forgery fails verification.",
      },
      {
        id: "abmp",
        title: "Adaptive Bandwidth Monitoring Protocol",
        kind: "Anomaly-based network detection",
        year: "2025",
        lede: "A big download and data exfiltration look the same to a fixed threshold. Not to this.",
        body: "ABMP learns what normal looks like from a rolling 20-second window of live NIC counters and flags traffic three standard deviations out. It is written as a real protocol: a three-state machine (calibrate, monitor, violation) and a JSON data unit every second. It runs out of band, adding under 5 ms to the host.",
        metrics: [
          { value: "3 SD", label: "rolling Z-score trigger" },
          { value: "<5 ms", label: "host overhead" },
          { value: "45.09 MB/s", label: "spike caught at 1 s granularity" },
        ],
        stack: ["Python", "psutil", "NumPy", "WebSockets", "Streamlit"],
        links: [],
        figure: "spike",
        caption: "A rolling three-sigma baseline, the state machine, and the data units it emits.",
        figureAlt:
          "Animated chart: network throughput scrolls past a rolling three-sigma band, a 45.09 MB/s spike breaks out, the protocol moves from monitoring to violation, and JSON data units print below.",
      },
    ],
  },
];

export const notes: Note[] = [
  {
    title: "Natural language to app schema compiler",
    year: "2026",
    line: "Plain English in, validated UI, API, database and auth schemas out. Five Gemini stages, a 90% pass rate on a 20-test harness, and a repair engine that reruns only the stage that failed.",
    links: [
      { label: "Live", href: "https://nl-app-compiler.vercel.app" },
      { label: "Source", href: "https://github.com/Arjunx156/nl-app-compiler" },
    ],
  },
  {
    title: "Local LLM benchmarking harness",
    year: "2026",
    line: "Six open-weight models, forty tasks and three graders (exact match, LLM-as-judge, sandboxed code execution), all offline, with latency and throughput logged per model.",
    links: [{ label: "Source", href: "https://github.com/Arjunx156/Local-LLM-Benchmarking-Assistant" }],
  },
  {
    title: "Kachra se Kamai",
    year: "2026",
    line: "Snap your dustbin and Amazon Nova prices your recyclables, then bundles pickups with your neighbours' for local waste pickers. Built on AWS SAM, Bedrock and Strands Agents.",
    links: [{ label: "Source", href: "https://github.com/Arjunx156/kachra-se-kamai" }],
  },
  {
    title: "Task manager agent",
    year: "2026",
    line: "Scheduling, notes and day planning split across Google ADK sub-agents, deployed as a managed service on Cloud Run.",
    links: [{ label: "Source", href: "https://github.com/Arjunx156/task-manager-agent" }],
  },
];
