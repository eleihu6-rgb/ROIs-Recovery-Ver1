import importlib.util
from pathlib import Path


def _load_converter():
    converter_path = Path(__file__).resolve().parents[1] / "F8" / "legacy_ro_converter.py"
    spec = importlib.util.spec_from_file_location("legacy_ro_converter", converter_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_convert_output_preserves_preassigned_pairing_source_from_roster_flight():
    converter = _load_converter()

    old_input = {
        "Roster": [],
        "RosterFlight": [
            {
                "id": "959270",
                "crewId": "13441",
                "pairingId": "14477",
                "actingRank": "FO",
                "source": "PA",
            },
            {
                "id": "959271",
                "crewId": "13441",
                "pairingId": "14477",
                "actingRank": "FO",
                "source": "PA",
            },
        ],
        "RosterGround": [],
        "Pairing": [],
    }
    old_output = {
        "Roster": [
            {
                "crewId": "13441",
                "pairingId": "14477",
                "actingRank": "FO",
                "assignmentGroup": "FLY",
                "assignment": "FLY",
                "source": "CR",
            }
        ],
        "RosterFlight": [
            {
                "id": "959270",
                "crewId": "13441",
                "pairingId": "14477",
                "actingRank": "FO",
                "source": "PA",
            }
        ],
    }

    converted = converter.convert_output(old_output, old_input)

    assert converted["ASSIGNMENTS"] == [
        {
            "crew_id": "13441",
            "pairing_id": "14477",
            "acting_rank": "FO",
            "base_match": "0",
            "source": "PA",
        }
    ]


def test_convert_output_keeps_solver_pairing_source_cr_when_not_preassigned():
    converter = _load_converter()

    old_input = {"Roster": [], "RosterFlight": [], "RosterGround": [], "Pairing": []}
    old_output = {
        "Roster": [
            {
                "crewId": "13441",
                "pairingId": "14477",
                "actingRank": "FO",
                "assignmentGroup": "FLY",
                "assignment": "FLY",
                "source": "CR",
            }
        ],
        "RosterFlight": [],
    }

    converted = converter.convert_output(old_output, old_input)

    assert converted["ASSIGNMENTS"][0]["source"] == "CR"
