#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void teachingDetailParser::init(vector<string>& headers) {}


static vector<string> teachingDetailDefaultHeaders = { "id", "studentId", "teachName", "startDt", "endDt", "status", "lastModified", "modifiedBy" };
vector<string>& teachingDetailParser::getDefaultHeaders() {
	return teachingDetailDefaultHeaders;
}

void* teachingDetailParser::createInstance() {
	return new TeachingDetail();
}

void teachingDetailParser::deleteInstance(void* obj) {
	delete (TeachingDetail*)obj;
}

string teachingDetailParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TeachingDetail * ref = (TeachingDetail *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->getId() << "^"; }
		else if (headers[i] == "teachId") { ss << ref->getTeachId() << "^"; }
		else if (headers[i] == "studentId") { ss << ref->getStudentId() << "^"; }
		else if (headers[i] == "teacherId") { ss << ref->getTeacherId() << "^"; }
		else if (headers[i] == "teacherQual") { ss << ref->getTeacherQual() << "^"; }
		else if (headers[i] == "rankPosition") { ss << ref->getRankPosition() << "^"; }
		else if (headers[i] == "teachType") { ss << ref->getTeachType() << "^"; }
		else if (headers[i] == "fleets") { ss << ref->getFleets() << "^"; }
		else if (headers[i] == "flightType") { ss << ref->getFlightType() << "^"; }
		else if (headers[i] == "blh") { ss << ref->getBlh() << "^"; }
		else if (headers[i] == "flightCount") { ss << ref->getFlightCount() << "^"; }
		else if (headers[i] == "teacherActingrank") { ss << ref->getTeacherActingrank() << "^"; }
		else if (headers[i] == "teacherSeqOrder") { ss << ref->getTeacherSeqOrder() << "^"; }
		else if (headers[i] == "studentActingrank") { ss << ref->getStudentActingrank() << "^"; }
		else if (headers[i] == "studentSeqOrder") { ss << ref->getStudentSeqOrder() << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("teachingDetail", headers[i]); }
	}
	return ss.str();
}

void teachingDetailParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TeachingDetail * ref = (TeachingDetail *)obj;
	if (headers[index] == "id") { ref->setId(atoll(value)); }
	else if (headers[index] == "teachId") { ref->setTeachId(value); }
	else if (headers[index] == "studentId") { ref->setStudentId(value); }
	else if (headers[index] == "teacherId") { ref->setTeacherId(value); }
	else if (headers[index] == "teacherQual") { ref->setTeacherQual(value); }
	else if (headers[index] == "rankPosition") { ref->setRankPosition(value); }
	else if (headers[index] == "teachType") { ref->setTeachType(value); }
	else if (headers[index] == "fleets") { ref->setFleets(value); }
	else if (headers[index] == "flightType") { ref->setFlightType(value); }
	else if (headers[index] == "blh") { ref->setBlh(atoi(value)); }
	else if (headers[index] == "flightCount") { ref->setFlightCount(atoi(value)); }
	else if (headers[index] == "teacherActingrank") { ref->setTeacherActingrank(value); }
	else if (headers[index] == "teacherSeqOrder") { ref->setTeacherSeqOrder(atoi(value)); }
	else if (headers[index] == "studentActingrank") { ref->setStudentActingrank(value); }
	else if (headers[index] == "studentSeqOrder") { ref->setStudentSeqOrder(atoi(value)); }
	else if (headers[index] == "isTotalConstraint") {
		string temp = "false";
		if (value == temp)
		    ref->setIsTotalConstraintForCA(false); 
		else
		{
			ref->setIsTotalConstraintForCA(true);
		}
	}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("teachingDetail", headers[index]); }
}

