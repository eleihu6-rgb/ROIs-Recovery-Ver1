#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseRoleParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseRoleDefaultHeaders = { "id","programId","programCourseId","programPnrId","bases","ranks","fleets","teams","actingRanks","role","roleNumber","roleType","needPip","modifiedBy","lastModified" };
vector<string>& tmProgramCourseRoleParser::getDefaultHeaders() {
	return tmProgramCourseRoleDefaultHeaders;
}

void* tmProgramCourseRoleParser::createInstance() {
	return new TmProgramCourseRole();
}

void tmProgramCourseRoleParser::deleteInstance(void* obj) {
	delete (TmProgramCourseRole*)obj;
}

string tmProgramCourseRoleParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseRole * ref = (TmProgramCourseRole *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "programPnrId") { ss << ref->programCoursePnrId << "^"; }
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
		else { logUnkonwnField("tmProgramCourseRole", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseRoleParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseRole * ref = (TmProgramCourseRole *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "programCourseId") { ref->programCourseId = atoll(value); }
	else if (headers[index] == "programPnrId") { ref->programCoursePnrId = atoll(value); }
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
	else if (headers[index] == "roleNumber") { ref->roleNumber = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "roleType") { ref->roleType = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "needPip") { ref->needPip = (atoi(value) == 1); }
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("tmProgramCourseRole", headers[index]); }
}

