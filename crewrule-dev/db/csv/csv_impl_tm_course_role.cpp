#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmCourseRoleParser::init(vector<string>& headers) {}


static vector<string> tmCourseRoleDefaultHeaders = { "id","minCapacity","maxCapacity","courseId","role","lastModified","modifiedBy" };
vector<string>& tmCourseRoleParser::getDefaultHeaders() {
	return tmCourseRoleDefaultHeaders;
}

void* tmCourseRoleParser::createInstance() {
	return new TmCourseRole();
}

void tmCourseRoleParser::deleteInstance(void* obj) {
	delete (TmCourseRole*)obj;
}

string tmCourseRoleParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmCourseRole * ref = (TmCourseRole *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "minCapacity") { ss << ref->minCapacity << "^"; }
		else if (headers[i] == "maxCapacity") { ss << ref->maxCapacity << "^"; }
		else if (headers[i] == "courseId") { ss << ref->courseId << "^"; }
		else if (headers[i] == "role") { ss << ref->role << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmCourseRole", headers[i]); }
	}
	return ss.str();
}

void tmCourseRoleParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmCourseRole * ref = (TmCourseRole *)obj;

	///
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "minCapacity") { 
		ref->minCapacity = (value == NULL || strlen(value) == 0) ? INT_MIN : atoi(value);
	}
	else if (headers[index] == "maxCapacity") { 
		ref->maxCapacity = (value == NULL || strlen(value) == 0) ? INT_MAX : atoi(value);
	}
	else if (headers[index] == "courseId") { ref->courseId = atoll(value); }
	else if (headers[index] == "role") { ref->role = value; }
	else if (headers[index] == "modifiedBy") {  }
	else if (headers[index] == "lastModified") {  }
	else { logUnkonwnField("tmCourseRole", headers[index]); }
}

