#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseIpRoleParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseIpRoleDefaultHeaders = { "id","programId","programCourseId","programPnrId","bases","ranks","modifiedBy","lastModified" };
vector<string>& tmProgramCourseIpRoleParser::getDefaultHeaders() {
	return tmProgramCourseIpRoleDefaultHeaders;
}

void* tmProgramCourseIpRoleParser::createInstance() {
	return new TmProgramCourseIpRole();
}

void tmProgramCourseIpRoleParser::deleteInstance(void* obj) {
	delete (TmProgramCourseIpRole*)obj;
}

string tmProgramCourseIpRoleParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseIpRole * ref = (TmProgramCourseIpRole *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "programPnrId") { ss << ref->programCoursePnrId << "^"; }
		else if (headers[i] == "bases") { ss << ref->base << "^"; }
		else if (headers[i] == "ranks") { ss << ref->rank << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseIpRole", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseIpRoleParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseIpRole * ref = (TmProgramCourseIpRole *)obj;

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
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("tmProgramCourseIpRole", headers[index]); }
}

