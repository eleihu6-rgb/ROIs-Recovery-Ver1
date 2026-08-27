#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseIpckParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseIpckDefaultHeaders = { "id","programId","tmProgramCourseId","tmProgramCoursePnrId","ipckQualOption","ipckQual","ipckNumber","modifiedBy","lastModified" };
vector<string>& tmProgramCourseIpckParser::getDefaultHeaders() {
	return tmProgramCourseIpckDefaultHeaders;
}

void* tmProgramCourseIpckParser::createInstance() {
	return new TmProgramCourseIpck();
}

void tmProgramCourseIpckParser::deleteInstance(void* obj) {
	delete (TmProgramCourseIpck*)obj;
}

string tmProgramCourseIpckParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourseIpck * ref = (TmProgramCourseIpck *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "tmProgramCourseId") { ss << ref->tmProgramCourseId << "^"; }
		else if (headers[i] == "tmProgramCoursePnrId") { ss << ref->tmProgramCoursePnrId << "^"; }
		else if (headers[i] == "ipckQualOption") { ss << ref->ipckQualOption << "^"; }
		else if (headers[i] == "ipckQual") { ss << ref->ipckQual << "^"; }
		else if (headers[i] == "ipckNumber") { ss << ref->ipckNumber << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourseIpck", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseIpckParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourseIpck * ref = (TmProgramCourseIpck *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "tmProgramCourseId") { ref->tmProgramCourseId = atoll(value); }
	else if (headers[index] == "tmProgramCoursePnrId") { ref->tmProgramCoursePnrId = atoll(value); }
	else if (headers[index] == "ipckQualOption") { ref->ipckQualOption = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "ipckQual") { 
		ref->ipckQual = (value == NULL || strlen(value) == 0) ? "" : value;
		if (!ref->ipckQual.empty()) {
			split(ref->ipckQual, '|', ref->ipckQuals);
			for (auto& qual : ref->ipckQuals) {
				if (qual.length() > 4) {
					//移除后缀_P_Q
					qual.erase(qual.length() - 4, 4);
				}
			}
		}
	}
	else if (headers[index] == "ipckNumber") { ref->ipckNumber = (value == NULL || strlen(value) == 0) ? -1 : atoi(value); }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("tmProgramCourseIpck", headers[index]); }
}

