#!/bin/bash
#
# KB Ingestion Script
#
# Usage:
#   ./scripts/ingest-kb.sh granola /path/to/granola-export.json
#   ./scripts/ingest-kb.sh telegram /path/to/telegram-export.json
#   ./scripts/ingest-kb.sh file /path/to/notes.md --title "My Notes" --tags "notes,personal"
#
# Environment:
#   ASKKAYA_API_URL - Base URL for API (default: https://us-central1-askkaya-47cef.cloudfunctions.net)
#

set -e

API_URL="${ASKKAYA_API_URL:-https://us-central1-askkaya-47cef.cloudfunctions.net}"
INGEST_ENDPOINT="${API_URL}/ingestApi"

show_help() {
    echo "AskKaya KB Ingestion Tool"
    echo ""
    echo "Usage:"
    echo "  $0 granola <export-file>              Ingest Granola meeting notes export"
    echo "  $0 telegram <export-file>             Ingest Telegram chat export"
    echo "  $0 file <file> [options]              Ingest a single file"
    echo "  $0 dir <directory> [options]          Ingest all .md files in directory"
    echo ""
    echo "Options for file/dir:"
    echo "  --title <title>                       Article title"
    echo "  --tags <tag1,tag2>                    Comma-separated tags"
    echo "  --client-id <id>                      Client ID for client-specific KB"
    echo ""
    echo "Examples:"
    echo "  $0 granola ~/Downloads/granola-export.json"
    echo "  $0 telegram ~/Downloads/telegram-result.json"
    echo "  $0 file ~/notes/product-faq.md --title \"Product FAQ\" --tags \"faq,product\""
    echo "  $0 dir ~/docs/kb --tags \"documentation\""
}

ingest_granola() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo "Error: File not found: $file"
        exit 1
    fi

    echo "Ingesting Granola export from: $file"

    # Read file content
    local data=$(cat "$file")

    # Send to API
    curl -s -X POST "$INGEST_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"source\": \"granola\", \"data\": $data}" | jq .
}

ingest_telegram() {
    local file="$1"
    if [ ! -f "$file" ]; then
        echo "Error: File not found: $file"
        exit 1
    fi

    echo "Ingesting Telegram export from: $file"

    # Read file content
    local data=$(cat "$file")

    # Send to API
    curl -s -X POST "$INGEST_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"source\": \"telegram\", \"data\": $data}" | jq .
}

ingest_file() {
    local file="$1"
    shift

    if [ ! -f "$file" ]; then
        echo "Error: File not found: $file"
        exit 1
    fi

    local title=""
    local tags=""
    local client_id=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --title) title="$2"; shift 2 ;;
            --tags) tags="$2"; shift 2 ;;
            --client-id) client_id="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    # Default title to filename
    [ -z "$title" ] && title=$(basename "$file" .md)

    echo "Ingesting file: $file"

    # Read content and escape for JSON
    local content=$(cat "$file" | jq -Rs .)

    # Build tags array
    local tags_json="[]"
    if [ -n "$tags" ]; then
        tags_json=$(echo "$tags" | jq -R 'split(",")')
    fi

    # Build request
    local request="{\"content\": $content, \"source\": \"manual\", \"title\": \"$title\", \"tags\": $tags_json"
    [ -n "$client_id" ] && request="$request, \"client_id\": \"$client_id\""
    request="$request}"

    # Send to API
    curl -s -X POST "$INGEST_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$request" | jq .
}

ingest_dir() {
    local dir="$1"
    shift

    if [ ! -d "$dir" ]; then
        echo "Error: Directory not found: $dir"
        exit 1
    fi

    local tags=""
    local client_id=""

    while [ $# -gt 0 ]; do
        case "$1" in
            --tags) tags="$2"; shift 2 ;;
            --client-id) client_id="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    echo "Ingesting directory: $dir"

    local items="[]"

    # Build items array from all .md files
    for file in "$dir"/*.md; do
        [ -f "$file" ] || continue

        local title=$(basename "$file" .md)
        local content=$(cat "$file" | jq -Rs .)

        local tags_json="[\"manual\"]"
        if [ -n "$tags" ]; then
            tags_json=$(echo "$tags" | jq -R 'split(",") + ["manual"]')
        fi

        local item="{\"content\": $content, \"source\": \"manual\", \"title\": \"$title\", \"tags\": $tags_json"
        [ -n "$client_id" ] && item="$item, \"client_id\": \"$client_id\""
        item="$item}"

        items=$(echo "$items" | jq ". + [$item]")
    done

    local count=$(echo "$items" | jq 'length')
    echo "Found $count files to ingest"

    if [ "$count" -eq 0 ]; then
        echo "No .md files found in directory"
        exit 0
    fi

    # Send to API
    curl -s -X POST "$INGEST_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "{\"items\": $items}" | jq .
}

# Main
case "${1:-}" in
    granola)
        ingest_granola "$2"
        ;;
    telegram)
        ingest_telegram "$2"
        ;;
    file)
        shift
        ingest_file "$@"
        ;;
    dir)
        shift
        ingest_dir "$@"
        ;;
    -h|--help|help|"")
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        show_help
        exit 1
        ;;
esac
