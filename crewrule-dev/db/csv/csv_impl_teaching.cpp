#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void teachingParser::init(vector<string>& headers) {}


static vector<string> teachingDefaultHeaders = { "id", "studentId", "teachName", "startDt", "endDt", "status", "lastModified", "modifiedBy" };
vector<string>& teachingParser::getDefaultHeaders() {
	return teachingDefaultHeaders;
}

void* teachingParser::createInstance() {
	return new Teaching();
}

void teachingParser::deleteInstance(void* obj) {
	delete (Teaching*)obj;
}

string teachingParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Teaching * ref = (Teaching *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getId() << "^"; }
		else if (headers[i] == "studentId") { ss << ref->getStudentId() << "^"; }
		else if (headers[i] == "teachName") { ss << ref->getTeachName() << "^"; }
		else if (headers[i] == "startDt") { ss << utcToUtcDtString(ref->getStartDt()) << "^"; }
		else if (headers[i] == "endDt") { ss << utcToUtcDtString(ref->getEndDt()) << "^"; }
		else if (headers[i] == "status") { ss << ref->getStatus() << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("teaching", headers[i]); }
	}
	return ss.str();
}

void teachingParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Teaching * ref = (Teaching *)obj;
	if (headers[index] == "id") { ref->setId(atoll(value)); }
	else if (headers[index] == "studentId") { ref->setStudentId(value); }
	else if (headers[index] == "teachName") { ref->setTeachName(value); }
	else if (headers[index] == "startDt") { ref->setStartDt(utcStrToUtc(value)); }
	else if (headers[index] == "endDt") { ref->setEndDt(utcStrToUtc(value)); }
	else if (headers[index] == "status") { ref->setStatus(atoi(value)); }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("teaching", headers[index]); }
}

