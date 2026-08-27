#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseIpRoleQualParser::init(vector<string>& headers) {}


static vector<string> tmFootprintCourseIpRoleQualDefaultHeaders = { "id", "footprintId", "footprintCourseId", "footprintTraineeId", "footprintIpRoleId", "footprintIpRoleBaseId", "roleQualOption", "roleQual", "roleNumber", "modifiedBy", "lastModified" };
vector<string>& tmFootprintCourseIpRoleQualParser::getDefaultHeaders() {
	return tmFootprintCourseIpRoleQualDefaultHeaders;
}

void* tmFootprintCourseIpRoleQualParser::createInstance() {
	return new TmFootprintCourseIpRoleQual();
}

void tmFootprintCourseIpRoleQualParser::deleteInstance(void* obj) {
	delete (TmFootprintCourseIpRoleQual*)obj;
}

string tmFootprintCourseIpRoleQualParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprintCourseIpRoleQual * ref = (TmFootprintCourseIpRoleQual *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "footprintCourseId") { ss << ref->footprintCourseId << "^"; }
		else if (headers[i] == "footprintTraineeId") { ss << ref->footprintTraineeId << "^"; }
		else if (headers[i] == "footprintIpRoleId") { ss << ref->footprintCourseIpRoleId << "^"; }
		else if (headers[i] == "footprintIpRoleBaseId") { ss << ref->footprintCourseIpRoleBaseId << "^"; }
		else if (headers[i] == "roleQualOption") { ss << ref->roleQualOption << "^"; }
		else if (headers[i] == "roleQual") { ss << ref->roleQual << "^"; }
		else if (headers[i] == "roleNumber") { ss << ref->roleNumber << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmFootprintCourseIpRoleQual", headers[i]); }
	}
	return ss.str();
}

void tmFootprintCourseIpRoleQualParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprintCourseIpRoleQual * ref = (TmFootprintCourseIpRoleQual *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
	else if (headers[index] == "footprintCourseId") { ref->footprintCourseId = atoll(value); }
	else if (headers[index] == "footprintTraineeId") { ref->footprintTraineeId = atoll(value); }
	else if (headers[index] == "footprintIpRoleId") { ref->footprintCourseIpRoleId = atoll(value); }
	else if (headers[index] == "footprintIpRoleBaseId") { ref->footprintCourseIpRoleBaseId = atoll(value); }
	else if (headers[index] == "roleQualOption") { ref->roleQualOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "roleQual") {
		ref->roleQual = value;
		if (!ref->roleQual.empty() && ref->roleQual != "ALL" && ref->roleQual != "*") {
			split(ref->roleQual, '|', ref->roleQuals);
			for (auto& qual : ref->roleQuals) {
				if (qual.length() > 4) {
					qual.erase(qual.length() - 4, 4);
				}
			}
		}
	}
	else if (headers[index] == "roleNumber") { ref->roleNumber = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmFootprintCourseIpRoleQual", headers[index]); }
}
