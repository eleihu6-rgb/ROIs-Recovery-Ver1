#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmPairingChartCourseParser::init(vector<string>& headers) {}

static vector<string> tmPairingChartCourseDefaultHeaders = { "id","pairingChartId","courseId","modifiedBy","lastModified" };
vector<string>& tmPairingChartCourseParser::getDefaultHeaders() {
	return tmPairingChartCourseDefaultHeaders;
}

void* tmPairingChartCourseParser::createInstance() {
	return new TmPairingChartCourse();
}

void tmPairingChartCourseParser::deleteInstance(void* obj) {
	delete (TmPairingChartCourse*)obj;
}

string tmPairingChartCourseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmPairingChartCourse * ref = (TmPairingChartCourse *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "pairingChartId") { ss << ref->pairingChartId << "^"; }
		else if (headers[i] == "courseId") { ss << ref->courseId << "^"; }

		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmPairingChartCourse", headers[i]); }
	}
	return ss.str();
}

void tmPairingChartCourseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmPairingChartCourse * ref = (TmPairingChartCourse *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "pairingChartId") { ref->pairingChartId = atoll(value); }
	else if (headers[index] == "courseId") { ref->courseId = atoll(value); }

	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmPairingChartCourse", headers[index]); }
}

