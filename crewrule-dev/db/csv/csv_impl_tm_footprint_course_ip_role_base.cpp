#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseIpRoleBaseParser::init(vector<string>& headers) {}


static vector<string> tmFootprintCourseIpRoleBaseDefaultHeaders = { "id", "footprintId", "footprintCourseId", "footprintTraineeId", "footprintIpRoleId", "fleets", "teams", "actingRanks", "modifiedBy", "lastModified" };
vector<string>& tmFootprintCourseIpRoleBaseParser::getDefaultHeaders() {
	return tmFootprintCourseIpRoleBaseDefaultHeaders;
}

void* tmFootprintCourseIpRoleBaseParser::createInstance() {
	return new TmFootprintCourseIpRoleBase();
}

void tmFootprintCourseIpRoleBaseParser::deleteInstance(void* obj) {
	delete (TmFootprintCourseIpRoleBase*)obj;
}

string tmFootprintCourseIpRoleBaseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprintCourseIpRoleBase * ref = (TmFootprintCourseIpRoleBase *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "footprintCourseId") { ss << ref->footprintCourseId << "^"; }
		else if (headers[i] == "footprintTraineeId") { ss << ref->footprintTraineeId << "^"; }
		else if (headers[i] == "footprintIpRoleId") { ss << ref->footprintCourseIpRoleId << "^"; }
		else if (headers[i] == "fleets") { ss << ref->fleet << "^"; }
		else if (headers[i] == "teams") { ss << ref->team << "^"; }
		else if (headers[i] == "actingRanks") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmFootprintCourseIpRoleBase", headers[i]); }
	}
	return ss.str();
}

void tmFootprintCourseIpRoleBaseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprintCourseIpRoleBase * ref = (TmFootprintCourseIpRoleBase *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
	else if (headers[index] == "footprintCourseId") { ref->footprintCourseId = atoll(value); }
	else if (headers[index] == "footprintTraineeId") { ref->footprintTraineeId = atoll(value); }
	else if (headers[index] == "footprintIpRoleId") { ref->footprintCourseIpRoleId = atoll(value); }
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
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("tmFootprintCourseIpRoleBase", headers[index]); }
}
