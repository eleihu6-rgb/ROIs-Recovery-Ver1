#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmPairingChartRoleParser::init(vector<string>& headers) {}


static vector<string> tmPairingChartRoleDefaultHeaders = { "id","pairingChartId","bases","ranks","fleets","teams","actingRanks","roleNumber","footprintIds","modifiedBy","lastModified" };
vector<string>& tmPairingChartRoleParser::getDefaultHeaders() {
	return tmPairingChartRoleDefaultHeaders;
}

void* tmPairingChartRoleParser::createInstance() {
	return new TmPairingChartRole();
}

void tmPairingChartRoleParser::deleteInstance(void* obj) {
	delete (TmPairingChartRole*)obj;
}

string tmPairingChartRoleParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmPairingChartRole * ref = (TmPairingChartRole *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "pairingChartId") { ss << ref->pairingChartId << "^"; }
		else if (headers[i] == "bases") { ss << ref->base << "^"; }
		else if (headers[i] == "ranks") { ss << ref->rank << "^"; }
		else if (headers[i] == "fleets") { ss << ref->fleet << "^"; }
		else if (headers[i] == "teams") { ss << ref->team << "^"; }
		else if (headers[i] == "actingRanks") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "roleNumber") { ss << ref->roleNumber << "^"; }
		else if (headers[i] == "footprintIds") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmPairingChartRole", headers[i]); }
	}
	return ss.str();
}

void tmPairingChartRoleParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmPairingChartRole * ref = (TmPairingChartRole *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "pairingChartId") { ref->pairingChartId = atoll(value); }
	else if (headers[index] == "bases") {
		ref->base = value;
		if (!ref->base.empty() && ref->base != "ALL" && ref->base != "*") {
			split(ref->base, '|', ref->bases);
		}
	}
	else if (headers[index] == "ranks") {
		ref->rank = value;
		if (!ref->rank.empty() && ref->rank != "ALL" && ref->rank != "*") {
			split(ref->rank, '|', ref->ranks);
		}
	}
	else if (headers[index] == "fleets") {
		ref->fleet = value;
		if (!ref->fleet.empty() && ref->fleet != "ALL" && ref->fleet != "*") {
			split(ref->fleet, '|', ref->fleets);
		}
	}
	else if (headers[index] == "teams") {
		ref->team = value;
		if (!ref->team.empty() && ref->team != "ALL" && ref->team != "*") {
			split(ref->team, '|', ref->teams);
		}
	}
	else if (headers[index] == "actingRanks") {
		ref->actingRank = value;
		if (!ref->actingRank.empty() && ref->actingRank != "ALL" && ref->actingRank != "*") {
			split(ref->actingRank, '|', ref->actingRanks);
		}
	}
	else if (headers[index] == "roleNumber") { ref->roleNumber = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "footprintIds") {
		ref->footprintId = value;
		if (!ref->footprintId.empty() && ref->footprintId != "ALL" && ref->footprintId != "*") {
			split(ref->footprintId.c_str(), '|', ref->footprintIds);
		}
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmPairingChartRole", headers[index]); }
}

