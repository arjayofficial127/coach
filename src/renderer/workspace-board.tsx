import { useState } from "react";
import type { CoachBoard, CoachCard } from "../shared/coach-board";
import { Icon } from "./icon";

export function WorkspaceBoard({
  board,
  onChange,
  onLink,
}: {
  board: CoachBoard;
  onChange: (board: CoachBoard) => void;
  onLink: (target: string) => void;
}) {
  const [view, setView] = useState<"board" | "table" | "calendar">("board");
  const [month, setMonth] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
  const updateCard = (id: string, patch: Partial<CoachCard>) =>
    onChange({
      ...board,
      cards: board.cards.map((card) => (card.id === id ? { ...card, ...patch } : card)),
    });
  const addCard = (columnId: string) =>
    onChange({
      ...board,
      cards: [...board.cards, { id: crypto.randomUUID(), title: "New task", columnId }],
    });
  const cardFields = (card: CoachCard) => (
    <>
      <input
        aria-label="Card title"
        className="ws-card-title"
        value={card.title}
        maxLength={500}
        onChange={(event) => updateCard(card.id, { title: event.target.value })}
      />
      <label>
        Status
        <select
          aria-label={`Status for ${card.title}`}
          value={card.columnId}
          onChange={(event) => updateCard(card.id, { columnId: event.target.value })}
        >
          {board.columns.map((column) => (
            <option key={column.id} value={column.id}>
              {column.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Due date
        <input
          type="date"
          value={card.dueDate ?? ""}
          onChange={(event) => updateCard(card.id, { dueDate: event.target.value })}
        />
      </label>
      <label>
        Linked note
        <input
          placeholder="Notes/Brief.md"
          value={card.note ?? ""}
          maxLength={500}
          onChange={(event) => updateCard(card.id, { note: event.target.value })}
        />
      </label>
      {card.note && (
        <button type="button" className="ws-text-action" onClick={() => onLink(card.note ?? "")}>
          <Icon name="edit" /> Open linked note
        </button>
      )}
    </>
  );
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const firstDay = new Date(`${month}-01T12:00:00`).getDay();
  return (
    <section className="ws-board" data-coach-board>
      <input
        className="ws-board-title"
        aria-label="Board title"
        value={board.title}
        maxLength={200}
        onChange={(event) => onChange({ ...board, title: event.target.value })}
      />
      <nav className="ws-segmented" aria-label="Board views">
        {(["board", "table", "calendar"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            aria-pressed={view === mode}
            onClick={() => setView(mode)}
          >
            {mode === "board" && <Icon name="grid" />}
            {mode[0]?.toUpperCase()}
            {mode.slice(1)}
          </button>
        ))}
      </nav>
      {view === "board" && (
        <div className="ws-board-columns">
          {board.columns.map((column) => (
            <section className="ws-board-column" key={column.id}>
              <header>
                <input
                  aria-label="Column title"
                  maxLength={100}
                  value={column.title}
                  onChange={(event) =>
                    onChange({
                      ...board,
                      columns: board.columns.map((item) =>
                        item.id === column.id ? { ...item, title: event.target.value } : item,
                      ),
                    })
                  }
                />
                <span>{board.cards.filter((card) => card.columnId === column.id).length}</span>
              </header>
              {board.cards
                .filter((card) => card.columnId === column.id)
                .map((card) => (
                  <div className="ws-board-card" key={card.id}>
                    {cardFields(card)}
                  </div>
                ))}
              <button
                type="button"
                className="ws-text-action"
                disabled={board.cards.length >= 500}
                onClick={() => addCard(column.id)}
              >
                <Icon name="plus" /> Add card
              </button>
            </section>
          ))}
        </div>
      )}
      {view === "table" && (
        <div className="ws-board-table">
          {board.cards.map((card) => (
            <div className="ws-board-card" key={card.id}>
              {cardFields(card)}
            </div>
          ))}
          <button
            type="button"
            disabled={board.cards.length >= 500}
            onClick={() => addCard(board.columns[0]?.id ?? "next")}
          >
            <Icon name="plus" /> Add card
          </button>
        </div>
      )}
      {view === "calendar" && (
        <div className="ws-calendar">
          <label>
            Month
            <input
              type="month"
              aria-label="Calendar month"
              value={month}
              onChange={(event) => {
                if (/^\d{4}-\d{2}$/.test(event.target.value)) setMonth(event.target.value);
              }}
            />
          </label>
          <div className="ws-calendar-grid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <b key={day}>{day}</b>
            ))}
            {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
              .slice(0, firstDay)
              .map((day) => (
                <span key={day} />
              ))}
            {Array.from({ length: daysInMonth }, (_, index) => {
              const date = `${month}-${String(index + 1).padStart(2, "0")}`;
              return (
                <div key={date}>
                  <time dateTime={date}>{index + 1}</time>
                  {board.cards
                    .filter((card) => card.dueDate === date)
                    .map((card) => (
                      <button type="button" key={card.id} onClick={() => setView("table")}>
                        {card.title}
                      </button>
                    ))}
                </div>
              );
            })}
          </div>
          <small>
            {board.cards.filter((card) => !card.dueDate).length} cards without a date. Set dates in
            Board or Table.
          </small>
        </div>
      )}
      <small className="ws-muted">Changes are drafts until you save this .coach file.</small>
    </section>
  );
}
