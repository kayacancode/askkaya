#!/bin/bash
#
# Ingest Granola notes from Obsidian vault
#

set -e

OBSIDIAN_VAULT="/Users/kayajones/Library/Mobile Documents/iCloud~md~obsidian/Documents/fιи∂ιиgѕ ... ʆც тємρlαтe 2"
GRANOLA_DIR="$OBSIDIAN_VAULT/Granola notes"
API_URL="${ASKKAYA_API_URL:-https://us-central1-askkaya-47cef.cloudfunctions.net}/ingestApi"

echo "Ingesting Granola notes from: $GRANOLA_DIR"
echo "API endpoint: $API_URL"
echo ""

# Count files
total=$(find "$GRANOLA_DIR" -name "*.md" -type f ! -path "*/transcripts/*" 2>/dev/null | wc -l | tr -d ' ')
echo "Found $total markdown files (excluding transcripts)"
echo ""

# Build items array
items="[]"
count=0
skipped=0

while IFS= read -r -d '' file; do
    # Skip transcript files
    if [[ "$file" == *"/transcripts/"* ]]; then
        continue
    fi

    # Extract filename for title fallback
    filename=$(basename "$file" .md)

    # Read file content
    content=$(cat "$file")

    # Skip empty files
    if [ -z "$content" ] || [ ${#content} -lt 50 ]; then
        ((skipped++))
        continue
    fi

    # Extract granola_id from frontmatter if present
    granola_id=$(echo "$content" | grep -E "^granola_id:" | head -1 | sed 's/granola_id: *//' | tr -d '"' || echo "")

    # Extract title from frontmatter if present
    title=$(echo "$content" | grep -E "^title:" | head -1 | sed 's/title: *//' | tr -d '"' || echo "$filename")

    # Extract date from path or frontmatter
    date_folder=$(echo "$file" | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}" | head -1 || echo "")

    # Escape content for JSON
    escaped_content=$(echo "$content" | jq -Rs .)

    # Set source_id (use granola_id if available, otherwise hash)
    source_id="${granola_id:-$(echo "$content" | md5 | cut -c1-16)}"

    # Build item JSON
    item=$(jq -n \
        --arg content "$content" \
        --arg title "$title" \
        --arg source "granola" \
        --arg source_id "$source_id" \
        --arg date "$date_folder" \
        '{
            content: $content,
            title: $title,
            source: $source,
            source_id: $source_id,
            tags: ["granola", "meeting-notes", "obsidian"],
            source_created_at: (if $date != "" then ($date + "T00:00:00Z") else null end)
        }')

    items=$(echo "$items" | jq ". + [$item]")
    ((count++))

    # Progress indicator
    if [ $((count % 50)) -eq 0 ]; then
        echo "Processed $count files..."
    fi

    # Send in batches of 20 to avoid request size limits
    if [ $((count % 20)) -eq 0 ]; then
        echo "Sending batch of 20..."
        result=$(curl -s -X POST "$API_URL" \
            -H "Content-Type: application/json" \
            -d "{\"items\": $items}" 2>&1)
        echo "$result" | jq -r '"  Created: \(.created), Updated: \(.updated), Skipped: \(.skipped)"' 2>/dev/null || echo "  Batch sent"
        items="[]"
    fi

done < <(find "$GRANOLA_DIR" -name "*.md" -type f -print0 2>/dev/null)

# Send remaining items
remaining=$(echo "$items" | jq 'length')
if [ "$remaining" -gt 0 ]; then
    echo "Sending final batch of $remaining..."
    result=$(curl -s -X POST "$API_URL" \
        -H "Content-Type: application/json" \
        -d "{\"items\": $items}" 2>&1)
    echo "$result" | jq -r '"  Created: \(.created), Updated: \(.updated), Skipped: \(.skipped)"' 2>/dev/null || echo "  Batch sent"
fi

echo ""
echo "Done! Processed $count files, skipped $skipped empty files."
echo "Embeddings will be generated automatically via Firestore trigger."
