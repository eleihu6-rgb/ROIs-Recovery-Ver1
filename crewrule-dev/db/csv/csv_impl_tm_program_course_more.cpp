#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"
#include <limits>

void tmProgramCourseMoreParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseMoreDefaultHeaders = { "id","programId","tmProgramCourseId","tmProgramCoursePnrId","dependence","minGap","maxGap","legStation","lastModified","modifiedBy" };
vector<string>& tmProgramCourseMoreParser::getDefaultHeaders() {
	return tmProgramCourseMoreDefaultHeaders;
}

void* tmProgramCourseMoreParser::createInstance() {
	return new TmProgramCourseMore();
}

void tmProgramCourseMoreParser::deleteInstance(void* obj) {
	delete (TmProgramCourseMore*)obj;
}

string tmProgramCourseMoreParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseMore * ref = (TmProgramCourseMore *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "tmProgramCourseId") { ss << ref->tmProgramCourseId << "^"; }
		else if (headers[i] == "tmProgramCoursePnrId") { ss << ref->tmProgramCoursePnrId << "^"; }
		else if (headers[i] == "dependence") { ss << ref->dependence << "^"; }
		else if (headers[i] == "minGap") { ss << ref->minGap << "^"; }
		else if (headers[i] == "maxGap") { ss << ref->maxGap << "^"; }
		else if (headers[i] == "legStation") { ss << ref->legStation << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseMore", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseMoreParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseMore * ref = (TmProgramCourseMore *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "tmProgramCourseId") { ref->tmProgramCourseId = atoll(value); }
	else if (headers[index] == "tmProgramCoursePnrId") { ref->tmProgramCoursePnrId = atoll(value); }
	else if (headers[index] == "dependence") {	ref->dependence = value; }
	else if (headers[index] == "minGap") { ref->minGap = (value == NULL || strlen(value) == 0) ? 0 : atoi(value); }
	else if (headers[index] == "maxGap") { ref->maxGap = (value == NULL || strlen(value) == 0) ? INT_MAX : atoi(value); }
	else if (headers[index] == "legStation") { ref->legStation = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmProgramCourseMore", headers[index]); }
}

