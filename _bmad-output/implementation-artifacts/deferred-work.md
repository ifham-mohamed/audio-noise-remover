- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-create-a-bounded-preview.md`
  summary: Implement local preview execution that can access the selected browser media safely and produce playable enhanced audio.
  evidence: Story 3.1 creates only a prepared metadata/profile request; the repository has no preview worker or browser-file access path, so no enhanced artifact can yet be generated. Resolve local source access and connect the processing worker before claiming a preview is ready.
