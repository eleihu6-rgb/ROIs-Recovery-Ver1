#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmCourseRoleBaseParser::init(vector<string>& headers) {}


static vector<string> tmCourseRoleBaseDefaultHeaders = { "id","tmCourseRoleId","base","rank","fleet","team","actingRank", "operating", "lastModified","modifiedBy" };
vector<string>& tmCourseRoleBaseParser::getDefaultHeaders() {
	return tmCourseRoleBaseDefaultHeaders;
}

void* tmCourseRoleBaseParser::createInstance() {
	return new TmCourseRoleBase();
}

void tmCourseRoleBaseParser::deleteInstance(void* obj) {
	delete (TmCourseRoleBase*)obj;
}

string tmCourseRoleBaseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmCourseRoleBase * ref = (TmCourseRoleBase *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "tmCourseRoleId") { ss << ref->tmCourseRoleId << "^"; }
		else if (headers[i] == "base") { ss << ref->base << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "fleet") { ss << ref->fleet << "^"; }
		else if (headers[i] == "team") { ss << ref->team << "^"; }
		else if (headers[i] == "actingRank") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "operating") {
			if(ref->operating) ss << "Y" << "^";
			else ss << "N" << "^";
		}
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmCourseRoleBase", headers[i]); }
	}
	return ss.str();
}

void tmCourseRoleBaseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmCourseRoleBase * ref = (TmCourseRoleBase *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "tmCourseRoleId") { ref->tmCourseRoleId = atoll(value); }
	else if (headers[index] == "base") { 
		ref->base = value;
		if (!ref->base.empty() && ref->base != "ALL" && ref->base != "*") {
			split(ref->base, '|', ref->bases);
		}
	}
	else if (headers[index] == "rank") { 
		ref->rank = value;
		if (!ref->rank.empty() && ref->rank != "ALL" && ref->rank != "*") {
			split(ref->rank, '|', ref->ranks);
		}
	}
	else if (headers[index] == "fleet") { 
		ref->fleet = value;
		if (!ref->fleet.empty() && ref->fleet != "ALL" && ref->fleet != "*") {
			split(ref->fleet, '|', ref->fleets);
		}
	}
	else if (headers[index] == "team") { 
		ref->team = value;
		if (!ref->team.empty() && ref->team != "ALL" && ref->team != "*") {
			split(ref->team, '|', ref->teams);
		}
	}
	else if (headers[index] == "actingRank") {
		ref->actingRank = value;
		if (!ref->actingRank.empty() && ref->actingRank != "ALL" && ref->actingRank != "*") {
			split(ref->actingRank, '|', ref->actingRanks);
		}
	}
	else if (headers[index] == "operating") {
		ref->operating = (0 == strncmp(value, "Y", 1) || value[0] == '\0');
	}
	else if (headers[index] == "operating") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmCourseRoleBase", headers[index]); }
}

