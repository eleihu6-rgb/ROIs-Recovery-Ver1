#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramCourseParser::init(vector<string>& headers) {}


static vector<string> tmProgramCourseDefaultHeaders = { "id", "source","programId","courseId","plannedDate","rosterDate","rosterId","rosterGroundId","resourceCode","groupId","parentId","role","startTime","endTime","publishFlag","coursePhase","courseSeq","crewId","fltId","deviceTimeId","simioe","coursePreposition","footprint","program","course","programCoursePnr","isExtraCourse","status","rfAssignment","subTmProgramCourseId","lastModified","modifiedBy" };
vector<string>& tmProgramCourseParser::getDefaultHeaders() {
	return tmProgramCourseDefaultHeaders;
}

void* tmProgramCourseParser::createInstance() {
	return new TmProgramCourse();
}

void tmProgramCourseParser::deleteInstance(void* obj) {
	delete (TmProgramCourse*)obj;
}

string tmProgramCourseParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgramCourse * ref = (TmProgramCourse *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "source") { ss << ref->source << "^"; }
		else if (headers[i] == "programId") { ss << ref->programId << "^"; }
		else if (headers[i] == "courseId") { ss << ref->courseId << "^"; }
		else if (headers[i] == "plannedDate") { ss << utcToUtcTzString(ref->plannedDate) << "^"; }
		else if (headers[i] == "rosterDate") { ss << utcToUtcTzString(ref->rosterDate) << "^"; }
		else if (headers[i] == "rosterId") {
			// 后端要求，如果为0则不输出
			if (ref->rosterId != 0) ss << ref->rosterId;
			ss << "^";
		} else if (headers[i] == "rosterGroundId") {
			// 后端要求，如果为0则不输出
			if (ref->rosterGroundId != 0) ss << ref->rosterGroundId;
			ss << "^";
		}
		else if (headers[i] == "resourceCode") { ss << ref->resourceCode << "^"; }
		else if (headers[i] == "groupId") { ss << ref->groupId << "^"; }
		else if (headers[i] == "parentId") {
			// 后端要求，如果为0则不输出parentId
			if(ref->parentId != 0) ss << ref->parentId;
			ss << "^";
		}
		else if (headers[i] == "role") { ss << ref->role << "^"; }
		else if (headers[i] == "startTime") { ss << utcToUtcTzString(ref->startTime) << "^"; }
		else if (headers[i] == "endTime") { ss << utcToUtcTzString(ref->endTime) << "^"; }
		else if (headers[i] == "publishFlag") { ss << ref->publishFlag << "^"; }
		else if (headers[i] == "coursePhase") { ss << ref->coursePhase << "^"; }
		else if (headers[i] == "courseSeq") { ss << ref->courseSeq << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "fltId") {
			// 后端要求，如果为0则不输出
			if (ref->fltId != 0) ss << ref->fltId;
			ss << "^";
		}
		else if (headers[i] == "rfAssignment") { ss << ref->rfAssignment << "^"; }
		else if (headers[i] == "deviceTimeId") { ss << ref->deviceTimeId << "^"; }
		else if (headers[i] == "simioe") { ss << ref->simioe << "^"; }
		else if (headers[i] == "coursePreposition") { ss << ref->coursePreposition << "^"; }
		else if (headers[i] == "footprint") {ss << "^";}
		else if (headers[i] == "program") {ss << "^";}
		else if (headers[i] == "course") {ss << "^";}
		else if (headers[i] == "programCoursePnr") {ss << "^";}
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "isExtraCourse") { ss << (ref->isExtraCourse ? "1" : "0") << "^"; }
		
		else if (headers[i] == "subTmProgramCourseId") { ss << ref->subTmProgramCourseId << "^"; }

		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgramCourse", headers[i]); }
	}
	return ss.str();
}

void tmProgramCourseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgramCourse * ref = (TmProgramCourse *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "source" && !(value == nullptr || value[0] == '\0') ) { ref->source = value; }
	else if (headers[index] == "programId") { ref->programId = atoll(value); }
	else if (headers[index] == "courseId") { ref->courseId = atoll(value); }
	else if (headers[index] == "plannedDate") { ref->plannedDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "rosterDate") { ref->rosterDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "rosterId") { ref->rosterId = atoll(value); }
	else if (headers[index] == "rosterGroundId") { ref->rosterGroundId = atoll(value); }
	else if (headers[index] == "resourceCode") { ref->resourceCode = value; }
	else if (headers[index] == "groupId") { ref->groupId = value; }
	else if (headers[index] == "parentId") { ref->parentId = atoll(value); }
	else if (headers[index] == "role") { ref->role = value; }
	else if (headers[index] == "startTime") { ref->startTime = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "endTime") { ref->endTime = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "publishFlag") { ref->publishFlag = atoi(value); }
	else if (headers[index] == "coursePhase") { ref->coursePhase = value; }
	else if (headers[index] == "courseSeq") { 
		ref->courseSeq = value; 
		ref->courseSortSeq = atof(value);
	}
	else if (headers[index] == "crewId") { ref->crewId = value; }

	else if (headers[index] == "fltId") { ref->fltId = atoll(value); }
	else if (headers[index] == "fleet") { ref->fleet = value; }//不需要输出
	else if (headers[index] == "actDepArp") { ref->depStation = value; }//不需要输出
	else if (headers[index] == "actArvArp") { ref->arrStation = value; }//不需要输出
	else if (headers[index] == "actDepDtUtc") { ref->actStartTimeUtc = utcStrToUtc(value); }//不需要输出
	else if (headers[index] == "actArvDtUtc") { ref->actEndTimeUtc = utcStrToUtc(value); }//不需要输出
	else if (headers[index] == "rfAssignment") { ref->rfAssignment = value; }

	else if (headers[index] == "deviceTimeId") { ref->deviceTimeId = atoll(value); }
	else if (headers[index] == "simioe") { ref->simioe = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "coursePreposition") { 
		ref->coursePreposition = value; 
		vector<string> splits;
		if (!ref->coursePreposition.empty())
			split(ref->coursePreposition.c_str(), '|', ref->coursePrepositions);
	}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "footprint") {}
	else if (headers[index] == "program") {}
	else if (headers[index] == "course") {}
	else if (headers[index] == "programCoursePnr") {}
	else if (headers[index] == "isExtraCourse") { ref->isExtraCourse = (atoi(value) == 1);	}
	else if (headers[index] == "status") { ref->status = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "trainingResult") { ref->trainingResult = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "courseSeqStr") {}
	else if (headers[index] == "subTmProgramCourseId") { ref->subTmProgramCourseId = atoll(value); }
	else { logUnkonwnField("tmProgramCourse", headers[index]); }
}

