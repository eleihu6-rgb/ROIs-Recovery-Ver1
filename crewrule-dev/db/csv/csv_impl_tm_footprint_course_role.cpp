#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseRoleParser::init(vector<string>& headers) {}


static vector<string> tmFootprintCourseRoleDefaultHeaders = { "id", "footprintId", "footprintCourseId", "footprintTraineeId", "role", "roleNumber", "bases", "ranks", "actingRanks", "fleets", "teams", "roleType", "needPip", "modifiedBy", "lastModified" };
vector<string>& tmFootprintCourseRoleParser::getDefaultHeaders() {
	return tmFootprintCourseRoleDefaultHeaders;
}

void* tmFootprintCourseRoleParser::createInstance() {
	return new TmFootprintCourseRole();
}

void tmFootprintCourseRoleParser::deleteInstance(void* obj) {
	delete (TmFootprintCourseRole*)obj;
}

string tmFootprintCourseRoleParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprintCourseRole* ref = (TmFootprintCourseRole*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "footprintCourseId") { ss << ref->footprintCourseId << "^"; }
		else if (headers[i] == "footprintTraineeId") { ss << ref->footprintTraineeId << "^"; }
		else if (headers[i] == "bases") { ss << ref->base << "^"; }
		else if (headers[i] == "ranks") { ss << ref->rank << "^"; }
		else if (headers[i] == "fleets") { ss << ref->fleet << "^"; }
		else if (headers[i] == "teams") { ss << ref->team << "^"; }
		else if (headers[i] == "actingRanks") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "role") { ss << ref->role << "^"; }
		else if (headers[i] == "roleNumber") { ss << ref->roleNumber << "^"; }
		else if (headers[i] == "roleType") { ss << ref->roleType << "^"; }
		else if (headers[i] == "needPip") { ss << (ref->needPip ? "1" : "0") << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("TmFootprintCourseRole", headers[i]); }
	}
	return ss.str();
}

void tmFootprintCourseRoleParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprintCourseRole* ref = (TmFootprintCourseRole*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
	else if (headers[index] == "footprintCourseId") { ref->footprintCourseId = atoll(value); }
	else if (headers[index] == "footprintTraineeId") { ref->footprintTraineeId = atoll(value); }
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
	else if (headers[index] == "role") { ref->role = value; }
	else if (headers[index] == "roleNumber") { ref->roleNumber = atoi(value); }
	else if (headers[index] == "roleType") { ref->roleType = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "needPip") { ref->needPip = (atoi(value) == 1); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}

	else { logUnkonwnField("TmFootprintCourseRole", headers[index]); }



}

