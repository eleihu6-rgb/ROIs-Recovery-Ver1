#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseRoleQualParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseRoleQualDefaultHeaders = { "id","programId","programCourseId","programPnrId","programCourseRoleId","roleQualOption","roleQual","roleNumber","modifiedBy","lastModified" };
vector<string>& tmProgramCourseRoleQualParser::getDefaultHeaders() {
	return tmProgramCourseRoleQualDefaultHeaders;
}

void* tmProgramCourseRoleQualParser::createInstance() {
	return new TmProgramCourseRoleQual();
}

void tmProgramCourseRoleQualParser::deleteInstance(void* obj) {
	delete (TmProgramCourseRoleQual*)obj;
}

string tmProgramCourseRoleQualParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseRoleQual * ref = (TmProgramCourseRoleQual *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "programCourseId") { ss << ref->programCourseId << "^"; }
		else if (headers[i] == "programPnrId") { ss << ref->programCoursePnrId << "^"; }
		else if (headers[i] == "programCourseRoleId") { ss << ref->programCourseRoleId << "^"; }
		else if (headers[i] == "roleQualOption") { ss << ref->roleQualOption << "^"; }
		else if (headers[i] == "roleQual") { ss << ref->roleQual << "^"; }
		else if (headers[i] == "roleNumber") { ss << ref->roleNumber << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseRoleQual", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseRoleQualParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseRoleQual * ref = (TmProgramCourseRoleQual *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "programCourseId") { ref->programCourseId = atoll(value); }
	else if (headers[index] == "programPnrId") { ref->programCoursePnrId = atoll(value); }
	else if (headers[index] == "programCourseRoleId") { ref->programCourseRoleId = atoll(value); }
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
	else { logUnkonwnField("tmProgramCourseRoleQual", headers[index]); }
}

