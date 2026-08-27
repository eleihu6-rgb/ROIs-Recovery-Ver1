#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseIpRoleQualParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseIpRoleQualDefaultHeaders = { "id","programId","programCourseId","programPnrId","programIpRoleId","programIpRoleBaseId","roleQualOption","roleQual","roleNumber","modifiedBy","lastModified" };
vector<string>& tmProgramCourseIpRoleQualParser::getDefaultHeaders() {
	return tmProgramCourseIpRoleQualDefaultHeaders;
}

void* tmProgramCourseIpRoleQualParser::createInstance() {
	return new TmProgramCourseIpRoleQual();
}

void tmProgramCourseIpRoleQualParser::deleteInstance(void* obj) {
	delete (TmProgramCourseIpRoleQual*)obj;
}

string tmProgramCourseIpRoleQualParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseIpRoleQual * ref = (TmProgramCourseIpRoleQual *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "programPnrId") { ss << ref->programCoursePnrId << "^"; }
		else if (headers[i] == "programIpRoleId") { ss << ref->programCourseIpRoleId << "^"; }
		else if (headers[i] == "programIpRoleBaseId") { ss << ref->programCourseIpRoleBaseId << "^"; }
		else if (headers[i] == "roleQualOption") { ss << ref->roleQualOption << "^"; }
		else if (headers[i] == "roleQual") { ss << ref->roleQual << "^"; }
		else if (headers[i] == "roleNumber") { ss << ref->roleNumber << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseIpRoleQual", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseIpRoleQualParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseIpRoleQual * ref = (TmProgramCourseIpRoleQual *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "programCourseId") { ref->programCourseId = atoll(value); }
	else if (headers[index] == "programPnrId") { ref->programCoursePnrId = atoll(value); }
	else if (headers[index] == "programIpRoleId") { ref->programCourseIpRoleId = atoll(value); }
	else if (headers[index] == "programIpRoleBaseId") { ref->programCourseIpRoleBaseId = atoll(value); }
	else if (headers[index] == "roleQualOption") { ref->roleQualOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "roleQual") { 
		ref->roleQual = value; 
		if (!ref->roleQual.empty() && ref->roleQual != "ALL" && ref->roleQual != "*") {
			split(ref->roleQual, '|', ref->roleQuals);
			for (auto& qual : ref->roleQuals) {
				//移除后缀_P_Q
				if (qual.length() > 4) {
					qual.erase(qual.length() - 4, 4);
				}
			}
		}	
	}
	else if (headers[index] == "roleNumber") { ref->roleNumber = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmProgramCourseIpRoleQual", headers[index]); }
}

