#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseRoleQualParser::init(vector<string>& headers) {}


static vector<string> tmFootprintCourseRoleQualDefaultHeaders = { "id", "footprintId", "footprintCourseId", "footprintTraineeId", "footprintCourseRoleId", "roleQualOption", "roleQual", "roleNumber", "modifiedBy", "lastModified" };
vector<string>& tmFootprintCourseRoleQualParser::getDefaultHeaders() {
	return tmFootprintCourseRoleQualDefaultHeaders;
}

void* tmFootprintCourseRoleQualParser::createInstance() {
	return new TmFootprintCourseRoleQual();
}

void tmFootprintCourseRoleQualParser::deleteInstance(void* obj) {
	delete (TmFootprintCourseRoleQual*)obj;
}

string tmFootprintCourseRoleQualParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprintCourseRoleQual* ref = (TmFootprintCourseRoleQual*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "footprintCourseId") { ss << ref->footprintCourseId << "^"; }
		else if (headers[i] == "footprintTraineeId") { ss << ref->footprintTraineeId << "^"; }
		else if (headers[i] == "footprintCourseRoleId") { ss << ref->footprintCourseRoleId << "^"; }
		else if (headers[i] == "roleQualOption") { ss << ref->roleQualOption << "^"; }
		else if (headers[i] == "roleQual") { ss << ref->roleQual << "^"; }
		else if (headers[i] == "roleNumber") { ss << ref->roleNumber << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("TmFootprintCourseRoleQual", headers[i]); }
	}
	return ss.str();
}

void tmFootprintCourseRoleQualParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprintCourseRoleQual* ref = (TmFootprintCourseRoleQual*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
	else if (headers[index] == "footprintCourseId") { ref->footprintCourseId = atoll(value); }
	else if (headers[index] == "footprintTraineeId") { ref->footprintTraineeId = atoll(value); }
	else if (headers[index] == "footprintCourseRoleId") { ref->footprintCourseRoleId = atoll(value); }
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
	else if (headers[index] == "roleNumber") { ref->roleNumber = atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("TmFootprintCourseRoleQual", headers[index]); }
}

