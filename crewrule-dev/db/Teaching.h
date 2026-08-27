#ifndef TEACHING_H
#define TEACHING_H
#include <string>
#include <memory>
#include <vector>
/*
数据解释：
1 teachType: TEACH01(学员带飞), TEACH02(学员放单检查)
2 teaching.status: is-disable, 0表示enable, other表示 disable

逻辑
1 detail: 各自约束
	如 detail
		*		*		*		*		blh=100h
		738		CAP1					

2 detail约束条件
	fleet：			机型
	flightType：		DIR
	flightCount：	航段数，需大于等于
	blh：			大于等于

3 OR建议条件，
	只有OR自动排版需参考，手工排教学可不遵守
	即计算完成教学任务时，只看3中约束条件，不看4 OR建议条件
	rankPosition：	teacher position
	teacherActingRank： teacher rank
	

*/

class TeachingDetail;
class TeachingHistoryDetailForCACC;
class Teaching {
public:
	long long getId() { return id; }
	std::string getStudentId() { return studentId; }
	std::string getTeachName() { return teachName; }
	time_t getStartDt() { return startDt; }
	time_t getEndDt() { return endDt; }
	short getStatus() { return status; }


	void setId(long long v) { id = v; }
	void setStudentId(std::string v) { studentId = v; }
	void setTeachName(std::string v) { teachName = v; }
	void setStartDt(time_t v) { startDt = v; }
	void setEndDt(time_t v) { endDt = v; }
	void setStatus(short v) { status = v; }

	vector<shared_ptr<TeachingDetail>>& getDetails() { return details; }
	void setDetails(vector<shared_ptr<TeachingDetail>>& v) { details = v; }
	void addDetail(shared_ptr<TeachingDetail>& v) { details.push_back(v); }
private:
	long long id = 0;
	std::string studentId;
	std::string teachName;
	time_t startDt = 0;
	time_t endDt = 0;
	short status = 0; //0:enable, other:disable
	vector<shared_ptr<TeachingDetail>> details;
};

class TeachingDetail {
public:
	long long getId() { return id; }
	std::string getTeachId() { return teachId; }
	std::string getStudentId() { return studentId; }
	std::string getTeacherId() { return teacherId; }
	std::string getTeacherQual() { return teacherQual; }
	std::string getRankPosition() { return rankPosition; }
	std::string getTeachType() { return teachType; }
	std::string getFleets() { return fleets; }
	std::string getFlightType() { return flightType; }
	std::string getTeacherActingrank() { return teacherActingrank; }
	std::string getStudentActingrank() { return studentActingrank; }
	int getBlh() { return blh; }
	int getFlightCount() { return flightCount; }
	int getTeacherSeqOrder() { return teacherSeqOrder; }
	int getStudentSeqOrder() { return studentSeqOrder; }
	bool getIsTotalConstraintForCA(){ return isTotalConstraintForCA; }
	void setId(long long v) { id = v; }
	void setTeachId(std::string v) { teachId = v; }
	void setStudentId(std::string v) { studentId = v; }
	void setTeacherId(std::string v) { teacherId = v; }
	void setTeacherQual(std::string v) { teacherQual = v; }
	void setRankPosition(std::string v) { rankPosition = v; }
	void setTeachType(std::string v) { teachType = v; }
	void setFleets(std::string v) { fleets = v; }
	void setFlightType(std::string v) { flightType = v; }
	void setBlh(int v) { blh = v; }
	void setFlightCount(int v) { flightCount = v; }
	void setTeacherActingrank(std::string v) { teacherActingrank = v; }
	void setTeacherSeqOrder(int v) { teacherSeqOrder = v; }
	void setStudentActingrank(std::string v) { studentActingrank = v; }
	void setStudentSeqOrder(int v) { studentSeqOrder = v; }
	void setIsTotalConstraintForCA(bool v){ isTotalConstraintForCA = v; }
	void setCompletedFlightCount(int v){ completedFlightCount = v; }
	int getCompletedFlightCount(){ return completedFlightCount; }
	void setCompletedBlh(double v){ completedBlh = v; }
	double getCompleteBlh(){ return completedBlh; }
	void setRemainingBlh(double v){ remainBlh = v; }
	double getRemainBlh(){ return remainBlh; }
	void setRemainingFlightCount(int v){ remainingflightCount = v; }
	int getRemainingflightCount(){ return remainingflightCount; }
private:
	long long id = 0;
	std::string teachId;
	std::string studentId;
	std::string teacherId;
	std::string teacherQual;
	std::string rankPosition;
	std::string teachType;
	std::string fleets;
	std::string flightType;
	std::string teacherActingrank;
	std::string studentActingrank;
	int blh = 0;
	double completedBlh=0.0;
	double remainBlh = 0.0;
	int flightCount = 0;
	int completedFlightCount = 0;
	int remainingflightCount = 0;
	int teacherSeqOrder = 0;
	int studentSeqOrder = 0;
     
	bool isTotalConstraintForCA = false;

};
class TeachingHistoryDetailForCACC
{
public:
	void setStudentId(std::string v){ studentId = v; }
	std::string getStudentId(){ return studentId; }
	void setTeacherId(std::string v){ teacherId = v; }
	std::string getTeacherId(){ return teacherId; }
	void setType(std::string v){ type = v; }
	std::string getType(){ return type; }
	void setFleet(std::string v){ fleet = v; }
	std::string getFleet(){ return fleet; }
	void setCompletedFlightCount(int v){ completedFlightCount = v; }
	int getCompletedFlightCount(){ return completedFlightCount; }
	void setCompletedBlh(double v){ completedBlh = v; }
	double getCompletedBlh(){ return completedBlh; }
private:
	std::string studentId;
	std::string teacherId;
	std::string type;
	std::string fleet;
	int completedFlightCount = 0;
	double completedBlh = 0.0;

};
#endif//TEACHING_H