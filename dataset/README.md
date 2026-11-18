Place the four PKL CSV exports in this folder:

- PKL_players.csv
- PKL_teams.csv
- PKL_events.csv
- PKL_matches.csv

They are imported into MongoDB by server/scripts/importData.js and used to
train the five scikit-learn models in ml-service/app/train.py.
