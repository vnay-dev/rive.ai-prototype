type ExtractionSummaryPanelProps = {
  documents: number
  tags: number
  occurrences: number
  matchHits: number
  onStartReview: () => void
}

function pluralize(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`
}

export function ExtractionSummaryPanel({
  documents,
  tags,
  occurrences,
  matchHits,
  onStartReview,
}: ExtractionSummaryPanelProps) {
  return (
    <section className="extraction-summary" aria-label="Extraction summary">
      <div className="extraction-summary-stats">
        <span>
          <strong>{documents}</strong>
          Documents processed
        </span>
        <span>
          <strong>{tags}</strong>
          Tags detected
        </span>
        <span>
          <strong>{occurrences}</strong>
          Occurrences
        </span>
        <span>
          <strong>{matchHits}</strong>
          Total matches
        </span>
      </div>

      <div className="extraction-summary-card">
        <div>
          <h3>Ready for review</h3>
          <p>
            Found{" "}
            <span className="page-subtitle-emphasis">{pluralize(tags, "engineering tag")}</span>
            {" "}across{" "}
            <span className="page-subtitle-emphasis">{pluralize(occurrences, "occurrence")}</span>
            {" "}in{" "}
            <span className="page-subtitle-emphasis">{pluralize(documents, "document")}</span>
            .
          </p>
        </div>
        <button className="primary-button" onClick={onStartReview} type="button">
          Start reviewing
        </button>
      </div>
    </section>
  )
}
