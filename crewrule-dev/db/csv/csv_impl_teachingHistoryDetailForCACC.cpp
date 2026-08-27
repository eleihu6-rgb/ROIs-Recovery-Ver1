#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void teachingHistoryDetailForCACCParser::init(vector<string>& headers) {}
static vector<string> teachingHistoryDetailForCACCDefaultHeaders = { "studentId", "teacherId", "type", "fleet", "completedBlh", "completedFlightCount" };

vector<string>& teachingHistoryDetailForCACCParser::getDefaultHeaders() {
	return teachingHistoryDetailForCACCDefaultHeaders;
}

void* teachingHistoryDetailForCACCParser::createInstance() {
	return new TeachingHistoryDetailForCACC();
}

void teachingHistoryDetailForCACCParser::deleteInstance(void* obj) {
	delete (TeachingHistoryDetailForCACC*)obj;
}


string teachingHistoryDetailForCACCParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TeachingHistoryDetailForCACC * ref = (TeachingHistoryDetailForCACC *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "studentId") { ss << ref->getStudentId() << "^"; }
		else if (headers[i] == "teacherId") { ss << ref->getTeacherId() << "^"; }
		else if (headers[i] == "type") { ss << ref->getType() << "^"; }
		else if (headers[i] == "fleet") { ss << ref->getFleet() << "^"; }
		else if (headers[i] == "completedBlh") { ss << ref->getCompletedBlh() << "^"; }
		else if (headers[i] == "completedFlightCount") { ss << ref->getCompletedFlightCount() << "^"; }
		else { logUnkonwnField("teachingHistoryDetailForCACC", headers[i]); }
	}
	return ss.str();
}

void teachingHistoryDetailForCACCParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TeachingHistoryDetailForCACC * ref = (TeachingHistoryDetailForCACC *)obj;
	if (headers[index] == "teacherId") { ref->setTeacherId(value); }
	else if (headers[index] == "type") { ref->setType(value); }
	else if (headers[index] == "fleet") { ref->setFleet(value); }
	else if (headers[index] == "completedBlh") { ref->setCompletedBlh(atof(value)); }
	else if (headers[index] == "completedFlightCount") { ref->setCompletedFlightCount(atoi(value)); }
	else if (headers[index] == "studentId ") { ref->setTeacherId(value); }
	else { logUnkonwnField("teachingHistoryDetailForCACC", headers[index]); }
}