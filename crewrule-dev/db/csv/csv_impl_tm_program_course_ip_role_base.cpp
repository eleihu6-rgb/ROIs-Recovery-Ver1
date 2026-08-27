#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseIpRoleBaseParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseIpRoleBaseDefaultHeaders = { "id","programId","programCourseId","programPnrId","programIpRoleId","fleets","teams","actingRanks","modifiedBy","lastModified" };
vector<string>& tmProgramCourseIpRoleBaseParser::getDefaultHeaders() {
	return tmProgramCourseIpRoleBaseDefaultHeaders;
}

void* tmProgramCourseIpRoleBaseParser::createInstance() {
	return new TmProgramCourseIpRoleBase();
}

void tmProgramCourseIpRoleBaseParser::deleteInstance(void* obj) {
	delete (TmProgramCourseIpRoleBase*)obj;
}

string tmProgramCourseIpRoleBaseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseIpRoleBase * ref = (TmProgramCourseIpRoleBase *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "programPnrId") { ss << ref->programCoursePnrId << "^"; }
		else if (headers[i] == "programIpRoleId") { ss << ref->programCourseIpRoleId << "^"; }
		else if (headers[i] == "fleets") { ss << ref->fleet << "^"; }
		else if (headers[i] == "teams") { ss << ref->team << "^"; }
		else if (headers[i] == "actingRanks") { ss << ref->actingRank << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseIpRoleBase", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseIpRoleBaseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseIpRoleBase * ref = (TmProgramCourseIpRoleBase *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "programCourseId") { ref->programCourseId = atoll(value); }
	else if (headers[index] == "programPnrId") { ref->programCoursePnrId = atoll(value); }
	else if (headers[index] == "programIpRoleId") { ref->programCourseIpRoleId = atoll(value); }
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
	else { logUnkonwnField("tmProgramCourseIpRoleBase", headers[index]); }
}

