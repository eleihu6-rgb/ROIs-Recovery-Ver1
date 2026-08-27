#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmCourseRoleQualParser::init(vector<string>& headers) {}


static vector<string> tmCourseRoleQualDefaultHeaders = { "id","tmCourseRoleId","tmCourseRoleBaseId","condition","qual","peopleLimit","lastModified","modifiedBy" };
vector<string>& tmCourseRoleQualParser::getDefaultHeaders() {
	return tmCourseRoleQualDefaultHeaders;
}

void* tmCourseRoleQualParser::createInstance() {
	return new TmCourseRoleQual();
}

void tmCourseRoleQualParser::deleteInstance(void* obj) {
	delete (TmCourseRoleQual*)obj;
}

string tmCourseRoleQualParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmCourseRoleQual * ref = (TmCourseRoleQual *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "tmCourseRoleId") { ss << ref->tmCourseRoleId << "^"; }
		else if (headers[i] == "tmCourseRoleBaseId") { ss << ref->tmCourseRoleBaseId << "^"; }
		else if (headers[i] == "condition") { ss << ref->condition << "^"; }
		else if (headers[i] == "qual") { ss << ref->qual << "^"; }
		else if (headers[i] == "peopleLimit") { ss << ref->peopleLimit << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmCourseRoleQual", headers[i]); }
	}
	return ss.str();
}

void tmCourseRoleQualParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmCourseRoleQual * ref = (TmCourseRoleQual *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "tmCourseRoleId") { ref->tmCourseRoleId = atoll(value); }
	else if (headers[index] == "tmCourseRoleBaseId") { ref->tmCourseRoleBaseId = atoll(value); }
	else if (headers[index] == "condition") { ref->condition = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "qual") { 
		ref->qual = value; 
		if (!ref->qual.empty())
			split(ref->qual, '|', ref->quals);
		for (auto& qual : ref->quals) {
			//移除后缀_P_Q
			if (qual.length() > 4) {
				qual.erase(qual.length() - 4, 4);
			}
		}
	}
	else if (headers[index] == "peopleLimit") { ref->peopleLimit = atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmCourseRoleQual", headers[index]); }
}

