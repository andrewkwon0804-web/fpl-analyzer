-- FPL Points Lab: relational schema (SQLite)
-- One row per real-world entity; player_match is the fact table.

DROP TABLE IF EXISTS player_match;
DROP TABLE IF EXISTS fixtures;
DROP TABLE IF EXISTS players;
DROP TABLE IF EXISTS teams;

CREATE TABLE teams (
    season                 TEXT    NOT NULL,
    team_id                INTEGER NOT NULL,
    name                   TEXT    NOT NULL,
    short_name             TEXT    NOT NULL,
    strength               INTEGER,
    strength_attack_home   INTEGER,
    strength_attack_away   INTEGER,
    strength_defence_home  INTEGER,
    strength_defence_away  INTEGER,
    PRIMARY KEY (season, team_id)
);

CREATE TABLE players (
    season       TEXT    NOT NULL,
    player_id    INTEGER NOT NULL,   -- FPL "element" id, unique within a season only
    player_code  INTEGER NOT NULL,   -- stable across seasons
    web_name     TEXT    NOT NULL,
    full_name    TEXT    NOT NULL,
    position     TEXT    NOT NULL CHECK (position IN ('GK', 'DEF', 'MID', 'FWD', 'AM')),
    team_id      INTEGER NOT NULL,
    PRIMARY KEY (season, player_id),
    FOREIGN KEY (season, team_id) REFERENCES teams (season, team_id)
);

CREATE TABLE fixtures (
    season        TEXT    NOT NULL,
    fixture_id    INTEGER NOT NULL,
    gw            INTEGER,
    kickoff_time  TEXT,
    home_team_id  INTEGER NOT NULL,
    away_team_id  INTEGER NOT NULL,
    home_score    INTEGER,
    away_score    INTEGER,
    home_difficulty INTEGER,          -- FPL fixture difficulty rating (1-5) for the home side
    away_difficulty INTEGER,
    finished      INTEGER NOT NULL,
    PRIMARY KEY (season, fixture_id)
);

CREATE TABLE player_match (
    season            TEXT    NOT NULL,
    player_id         INTEGER NOT NULL,
    fixture_id        INTEGER NOT NULL,
    gw                INTEGER NOT NULL,
    team_id           INTEGER NOT NULL,
    opponent_team_id  INTEGER NOT NULL,
    was_home          INTEGER NOT NULL,
    minutes           INTEGER NOT NULL,
    starts            INTEGER NOT NULL,
    total_points      INTEGER NOT NULL,
    goals_scored      INTEGER NOT NULL,
    assists           INTEGER NOT NULL,
    clean_sheets      INTEGER NOT NULL,
    goals_conceded    INTEGER NOT NULL,
    saves             INTEGER NOT NULL,
    bonus             INTEGER NOT NULL,
    bps               INTEGER NOT NULL,
    yellow_cards      INTEGER NOT NULL,
    red_cards         INTEGER NOT NULL,
    expected_goals    REAL,
    expected_assists  REAL,
    expected_goals_conceded REAL,
    ict_index         REAL,
    influence         REAL,
    creativity        REAL,
    threat            REAL,
    defensive_contribution INTEGER,   -- only tracked from 2025-26 (new scoring rule)
    price             REAL    NOT NULL,   -- in £m
    selected_by       INTEGER,
    transfers_in      INTEGER,
    transfers_out     INTEGER,
    fpl_xp            REAL,              -- FPL's own expected-points figure, used as a baseline
    PRIMARY KEY (season, player_id, fixture_id),
    FOREIGN KEY (season, player_id)  REFERENCES players  (season, player_id),
    FOREIGN KEY (season, fixture_id) REFERENCES fixtures (season, fixture_id)
);

CREATE INDEX idx_pm_player_gw ON player_match (season, player_id, gw);
CREATE INDEX idx_pm_team_gw   ON player_match (season, team_id, gw);
