/**
1 RosterFlight定义
2 RosterFlightMgr,维护rosterFlight数据,维护 crew/flt索引
*/
#ifndef ROSTER_FLIGHT
#define ROSTER_FLIGHT
#include <string>
#include <memory>
#include <map>
#include <vector>
#include <set>
#include <sstream>

//
//domain
struct RosterFlight {
	long long id = 0;
	long long scenarioId = 0;
	long long fltId = 0;
	long long rosterId = 0;
	long long pairingId = 0;
	long long dutyId = 0;
	int seqOrder = 0;
	std::string crewId;
	std::string fltDt;
	std::string assignment;
	std::string division;
	std::string actingRank;
	std::string activeRank;
	std::string position;
	std::string checkType;
	std::string tsFlag;
	std::set<std::string> tsFlags;
	std::string accState;//适应状态
	int accTimezone = -1; //适应时区(分钟数)
	std::string source;
	std::string comments;
	time_t pickupDtLoc = 0;
	time_t firstBriefDtLoc = 0;
	time_t secondBriefDtLoc = 0;
	time_t debriefDtLoc = 0;
	time_t dropoffDtLoc = 0;

	//training Manage 训练
	std::string tmGroupId{};//training分组
	long long tmProgramCourseId = 0;//training课程
	long long parentTmProgramCourseId = 0;
	std::string tmResourceCode{}; //training课室
	std::string tmRole{}; //training角色 
	std::string tmSubRole{};
	std::string courseCode{};

	bool isExtraCourse = false;
	long long subTmProgramCourseId = 0;
	std::string subCourseCode;
	long long subParentTmProgramCourseId = 0;

	//pic手工标记
	std::string seqOrderSource = "";

	bool sendFlag = false;//仅透传，不做处理
	std::string tagSet;//仅透传，不做处理
	time_t pairingStartUtc = 0;//仅透传，不做处理

	int creditedInSec = 0;   //Segment的Credit Hour(实际时间)
	int fmCreditedInSec = 0; //Segment的首月Credit Hour(实际时间)
	int schCreditedInSec = 0;;  //Segment的Credit Hour(计划时间)
	int schFmCreditedInSec = 0; //Segment的首月Credit Hour(计划时间)

	int maxFdp = 0;

	bool isAgreeWork = false;  //是否同意工作

	std::string exceptionCode;   //异常代码，多个使用|分隔
	std::set<std::string> exceptionCodes{};

	std::string createdBy;//仅透传，不做处理
	time_t createdDt = 0;//仅透传，不做处理
	time_t lastModified = 0;//仅透传，不做处理
	std::string modifiedBy;//仅透传，不做处理

	RosterFlight();
	RosterFlight(long long fltId,long long rosterId, long long pairingId, long long dutyId,long long scenarioId, std::string crewId, int seqOrder, std::string fltDt, std::string assignment, std::string division, std::string actingRank, std::string checkType, std::string tsflag,std::string comments,std::string source);
	bool isSameFltCrew(const RosterFlight* o);

	bool isTrainingFlight() const;
};


#endif//ROSTER_FLIGHT