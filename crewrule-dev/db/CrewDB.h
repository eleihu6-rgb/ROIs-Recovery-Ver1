
#ifndef PAIRING_DB_H
#define PAIRING_DB_H
#include <stdio.h>
#include <unordered_map>
#include <memory>
#include <atomic>
#include <unordered_set>
#include <set>
#include <string>
#include "time.h"
#include "Voyage.h"
#include "Activity.h"
#include "Composition.h"
#include "Teaching.h"
#include "Duty.h"
#include "IndexCrewBaseRankFleet.h"
#include "ErrorContext.h"
#include "RecencyMgr.h"
#include "CalculationManday.h"
#include "RosterFlightMgr.h"
#include "CrewMonthManday.h"
#include "PortLOStatistics.h"

#include "RDOHelper/Helper6001.h"
#include "RDOHelper/Helper6001Cache.h"
#include "RDOHelper/Helper6001ParamCache.h"
#include "csv/csv_impl.h"
#include "RDOHelper/EnumerationDayOffPatternHelperParamCache.h"

#include "DBTrainingDataHolder.h"

//#include <vld.h>
#pragma once
namespace DutyCode {
	class DutyCodeAssignment;
	class DutyCodeConfig;
}

struct UpdateActivityIdItem;
class CrewDataContext;
class Segment;
class Pairing;

class TmTrainingConfigIndex;
class TmCourseBriefIndex;
class TmCourseDurationIndex;
class TmCourseRoleIndex;
class TmCourseRoleBaseIndex;
class TmCourseRoleQualIndex;
class TmCourseRoleDeviceIndex;
class TmFootprintIndex;
class TmFootprintCourseIndex;
class TmFootprintCourseTraineeIndex;
class TmFootprintCourseIpRoleIndex;
class TmFootprintCourseIpRoleBaseIndex;
class TmFootprintCourseIpRoleQualIndex;
class TmFootprintCourseRoleIndex;
class TmFootprintCourseRoleQualIndex;
class TmFootprintCourseRoleLimitationIndex;
class TmFootprintCourseSectorIndex;
class TmProgramIndex;
class TmProgramBuddyIndex;
class TmProgramBuddyTimeIndex;
class TmProgramBuddyCourseIndex;
class TmProgramPipIndex;
class TmProgramCourseIndex;
class TmProgramCourseInstructorIndex;
class TmProgramCourseLimitationIndex;
class TmProgramCourseIpRelevanceIndex;
class TmProgramCourseRoleIndex;
class TmProgramCourseRoleQualIndex;
class TmProgramCourseRoleLimitationIndex;
class TmProgramCourseIpRoleIndex;
class TmProgramCourseIpRoleBaseIndex;
class TmProgramCourseIpRoleQualIndex;
class TmProgramCoursePnrIndex;
class TmProgramCourseIpckIndex;
class TmProgramCourseMoreIndex;
class TmProgramCourseMoreLegIndex;
class TmDeviceTimeIndex;
class TmPairingChartIndex;
class TmPairingChartRoleIndex;
class TmPairingChartRoleQualIndex;
class TmPairingChartCourseIndex;

class CrewRpRecencyIndex;

class DataError;

struct GuaranteeFlyHours;
struct RULE_VIOLATION;
using std::vector;
using std::map;
//#include "..\ocilib\ocilib_types.h"

// shared_ptr声明 兼容 vs2008 vs2013
//#ifdef std::shared_ptr
#define SharedPtr std::shared_ptr
//#else
//#define SharedPtr std::tr1::shared_ptr
//#endif 

//#define ORDER_BY_IDCREW    "idcrew"
#define ORDER_BY_PAIR_ID   "pair_id"

//筛选条件
#define  FILTER_BY_PAIRING           "filter_by_pairing"    //按pairing直接筛选base fleet，以pairing.base/pairing.fleet_grp为筛选目标
#define  FILTER_BY_CREW              "filter_by_crew"       //按crew间接筛选pairing，通过base rank fleet筛选满足条件的crew，再通过crew->roster关联pairing对pairing进行筛选

//Attribute
#define ATTR_ROUTE_1A      21
#define ATTR_ROUTE_1B      22
#define ATTR_ROUTE_2A      23
#define ATTR_ROUTE_2B      24

#define ATTR_ROUTE_ALLOW_EXPAT  11
#define ATTR_ROUTE_MUST_EXPAT   12
#define ATTR_ROUTE_ICAO         13

#define ATTR_EXPAT_ALLOW   101
#define ATTR_EXPAT_MUST    102
#define ATTR_ICAO          103
#define ATTR_SPECIAL_AIRPORT 104
#define ATTR_REGIONAL       105
#define ATTR_PATTERN_US    201

class Entity {
public:
	virtual ~Entity() = default;
};

//------------ Attribute ------------------
struct ATTRIBUTE {
	long long id = 0;
	string type;
	string code;
	string airline;
	string operation;
	string source;
};
//--------------- Tag ----------------------
struct TAG_CATEGORY {
	long long id = 0;
	string code;
	string name;
	string type;
	string source;
	int ratio = 0;
	int idx = 0;
	string exceptTag;
	vector<string> divisions;
	vector<string> filiales;
};
struct TAG_GROUP {
	long long id = 0;
	long long tagCategoryId = 0;
	long long parentId = 0;
	string tableType;
	string type;
	string condition;
	int idx = 0;
	int level = 0;
};
struct TAG_FLIGHT {
	long long id = 0;
	long long tagGroupId = 0;
	time_t fltDtStart = 0;
	time_t fltDtEnd = 0;
	vector<string> fltNum;
	vector<string> fleet;
	vector<string> subFleets;
	vector<string> dir;
	string depArp;
	string arvArp;
	string stdStart;
	string stdEnd;
	string staStart;
	string staEnd;
	vector<string> assignments;
	string country;
	string scheduleBLHStart;
	string scheduleBLHEnd;
	string actBLHStart;
	string actBLHEnd;
	vector<string> fltType;
	string arvArpCategory;
	string depArpCategory;
	string airportCategory;
};
struct TAG_FLIGHT_COMPOSITION {
	long long id = 0;
	long long tagGroupId = 0;
	string division;
	vector<string> actingRank;
	int minValue = 0;
	int maxValue = 0;
};
struct TAG_DUTY {
	long long id = 0;
	long long tagGroupId = 0;
	string checkInStart;
	string checkInEnd;
	string checkOutStart;
	string checkOutEnd;
	string blhStart;
	string blhEnd;
	string fdpStart;
	string fdpEnd;
	string dpStart;
	string dpEnd;;
	string overlapPeriodStart;
	string overlapPeriodEnd;
	string segNum;
	string dutyDurationStart;
	string dutyDurationEnd;
	string dutySeq;
	string firstSegmentDepTimeStart;
	string firstSegmentDepTimeEnd;
	string fdpTouchTimeStart;
	string fdpTouchTimeEnd;
	string transitAirports;
	string transitDurationStart;
	string transitDurationEnd;
	int dutyDaysStart = 0;
	int dutyDaysEnd = 0;
	string firstFlySegDepStart;
	string firstFlySegDepEnd;
	string lastSegArvStart;
	string lastSegArvEnd;
	string lastFlySegArvStart;
	string lastFlySegArvEnd;
};
struct TAG_PAIRING {
	long long id = 0;
	long long tagGroupId = 0;
	vector<string> base;
	string pairingLength;
	string avgBlhLow;
	string avgBlhHigh;
	string avgBlockPerSegLow;
	string avgBlockPerSegHigh;
	string layover;
	vector<string> layoverCountries;
	vector<string> exceptLayoverCountries;
	int overNightDayStart = 0;
	int overNightDayEnd = 0;

	int pairingDaysStart = 0;
	int pairingDayEnd = 0;
	string layoverDurationStart;
	string layoverDurationEnd;
	int atdoStart = 0;
	int atdoEnd = 0;
	int exdoStart = 0;
	int exdoEnd = 0;

	vector<string> assignmentGroup;
};
struct TAG_ROSTER_GROUND {
	long long id = 0;
	long long tagGroupId = 0;
	string strDtLow;
	string strDtHigh;
	string endDtLow;
	string endDtHigh;
	vector<string> locations;
	vector<string> assignmentGroups;
	vector<string> assignments;
	vector<string> assignmentTypes;
	string isSwap;
	string isRequest;
	string isTraining;
	string trainingRole;
	string dutyPeriodLow;
	string dutyPeriodHigh;
	string overlapPeriodLow;
	string overlapPeriodHigh;
	string createdBy;
	string createdDt;
	string modifiedBy;
	string lastModified;
};
class TAG {
public:
	long long id = 0;
	long long tagCategoryId = 0;
	string parentId;
	string condition;
	string type;
	int level = -1;
	int idx = -1;
	vector<std::shared_ptr<TAG_GROUP>> groups;
};
struct TAG_SUPER_CATEGORY {
	long long id = 0;
	string filiale;
	string division;
	string name;
	string equilibriumType;
};
struct TAG_SUPER_CATEGORY_MAP {
	long long id = 0;
	long long tagSuperCategoryId = 0;
	long long tagCategoryId = 0;
};
struct DEPARTMENT_GROUP {
	long long id = 0;
	string filiale;
	string division;
	string groupName;
	string value;
};
struct HISTORY_CREW_STATISTICS {
	long long id = 0;
	string crewId;
	string crewRank;
	string crewPositions;
	string crewRadioQual;
	string month;
	long long tagCategoryId = 0;
	string tagCategoryCode;
	string quantity;
	int   totalBlockMinutes =0;
	long  totalFairness =0;
	int   totalStandby = 0;
	double ftPercentage = 1.0;
};
struct HISTORY_DEPARTMENT_STATISTICS {
	long long id = 0;
	string branchCode;
	string month;
	long long tagCategoryId = 0;
	string tagCategoryCode;
	string quantity;

	string departmentPosition;
	string departmentQual;
	int  iNumberOfCrews = 0; //部门内员工数
	int  totalBlockMinutes = 0; //部门内当月总飞时
	long totalFairnesss = 0; //部门内当月总航班系数
};

//------------ Assignment ------------------
struct ASSIGNMENT {
	string AIRLINE;           //VARCHAR2(2) not null,
	long long ASSIGNMENT_ID = 0; //NUMBER(9) not null,
	string assignment;        //VARCHAR2(20) not null,
    string defaultAssignmentGroup; //VARCHAR2(20),
	string DESCRIPTION;       //VARCHAR2(50) not null,
	string TYPE;              //VARCHAR2(3) not null,
	string COLOR_HEX;         //VARCHAR2(6),
	string PATTERN_CODE;      //VARCHAR2(20),
	string STANDALONE;        //VARCHAR2(1),
	string FIXED_STR_TM;      //VARCHAR2(5),
	string FIXED_END_TM;      //VARCHAR2(5),
	string divideCrewManday;  //20180827 ain, OP#1395
	double BT_PCT = 0;         //NUMBER(3,2),
	double CREDIT_PCT = 0;     //NUMBER(3,2),
	double FDP_PCT = 0;        //NUMBER(3,2),
	double DP_PCT = 0;         //NUMBER(3,2)
	double FT_PCT = 0;
	bool  isRecency = false;  //
	int DP_GAP = 0;
	double WP_PCT = 0;
	//int rest_time = 0;
	int REST_TIME = 0;
	bool tmCreditFlag = false;

	std::string label;

	int before_pct_dp_gap = 0;
	int after_pct_dp_gap = 0;
};
//------------ AssignmentGroup -------------
struct ASSIGNMENT_GROUP {
	string   airline;
	long long assignGrpId = 0;
	string   assignGrp;
	string   name;
	string   roIndicator;
	bool     allowOverlap = false;
};
//------------ ASSIGNMENT_OVERLAP ----------
struct ASSIGNMENT_OVERLAPPABLE {
	long long id = 0;
	string type;
	string assignmentGroupPrev;
	string assignmentPrev;
	string assignmentGroupNext;
	string assignmentNext;
	bool allowFullOverlap = false;
	string phase;
};
//------------ Qualification ------------
struct QUALIFICATION {
	long long id = 0;
	string   qualification;
	string   division;
	int   negativeSlippage;
	int   positiveSlippage;
	bool  baseMonthFlag;
	string negativeSlippageUnit;
	string positiveSlippageUnit;
};
//------------ Base ------------
struct BASE {
	string   airline;
	string   base;
	long long baseId = 0;
	string   name;
	int      displayOrder = 0;
};
//------------ Fleet ------------
struct FLEET {
	string   airline;
	string   fleet;
	string	 acType;
	string   description;
	string   fleetGrp;
	int      displayOrder{};
	long long fleetId{};
	int		 restfacility{-1};//飞行休息设施，0 - no rest facility,1 - adequate rest facility,2 - suitable rest facility, 3 - luxury rest facility
	int		 ccRestfacility{ -1 };//客舱休息设施
	int		 fdRestFacCnt{0};//飞行休息设施数量
	int		 ccRestFacCnt{ 0 };//客舱休息设施数量
};
//------------Sub Fleet ------------
struct SUB_FLEET {
	string   subFleet;
	string   iataAircraftType;
	string	 aircraftOwner;
	int      restFacility{0};//飞行休息设施，0 - no rest facility,1 - adequate rest facility,2 - suitable rest facility, 3 - luxury rest facility
	int		 ccRestFacility{0};//客舱休息设施
};
//------------ Rank ------------
struct RANK {
	string   airline;
	long long rankId{};
	string   rank;
	string   division;
	int      displayOrder{};
	bool     isIncludeInFt{ false };
	bool	 isActingRank{ false };
	bool	 isCrewRank{ false };
	bool	 isMustCrewRank{ false };
};
//------------ Rank Position ------------
struct RANK_POSITION {
	long long id{};
	string   airline;
	long long rankId{};
	string   position;
	string   division;
	int      displayOrder{};
	string   description;
	string   rank;
};
//------------ Dictionary ------------
struct Dictionary {
	long long id = 0;
	string parentCode;
	string code;
	string name;
	int idx = 0;
};

//------------ Team ------------
struct Team{
	long long id = 0;
	string airline;
	string team;
	string description;
	int displayOrder = 0;
};
//------------ SCENARIO -------------
struct Scenario {

	long long scenarioId{};    //scenario
	time_t startDtUTC{}; //mantis#2224, 规范化date/time命名
	time_t endDtUTC{};
	time_t startDtLoc{};
	time_t endDtLoc{};
	long long idTT{};     //flight table idSch
	string idTTT;
	long long idRuleSet{};//ruleset table idRuleSet
	long long idCQSet{};  //cqSet table cqSet

	string         category;
	long long idScenarioPair{};

	int            version{};
	string         status;
	vector<string> pairingAttributes;
	vector<string> pairingTags;
	vector<string> crewBases;
	vector<string> bases;
	vector<RANK>   rankList;
	vector<string> ranks;
	vector<string> actingRanks;
	vector<long long>    baseIds;
	vector<long long>    crewBaseIds;
	vector<long long>    fleetIds;
	vector<long long>    rankIds;
	vector<long long>    actingRankIds;
	vector<long long>    qualificationIds;
	vector<string> qualificationNames;
	vector<string> fleets;
	vector<int>    runMode;
	vector<string> assignGrps;
	string         assignmentGroupId;
	string         languageId;
	string         paList;
	string		   tagIds;
	string         refscenId;
	string         idUser;
	string         airline;
	string         division;
	string         loadType;
	time_t           tmst{};
	string		   rankCross;
	vector<string> divisionConstruction;

	vector<long long>    refLeadinIdList;

	enum class DeviceBookingType: unsigned int {
		BOOKED_SLOTS_ONLY = 0,
		BOOKED_AND_OPEN_SLOTS = 1
	};
	DeviceBookingType _deviceBookingType = DeviceBookingType::BOOKED_AND_OPEN_SLOTS;
};

//------------ SCENARIO_KPI -------------
struct ScenarioKpi {
	long long id{};
	long long scenarioId{};
	string			kpiNames;
	string			kpiValues;
	string			description;
	int				idx = 0;
	
};

struct CREW_REQUEST_DETAIL {
	long long id{};
	long long reqId{};
	string         crewId;
	string         startDateLocalStr;
	string         endDateLocalStr;
	string         buddyCrewId;
	string         type;
	long long pairingId{};
	long long rosterId{};
	string         priority;
	string         status;
	string         reason;
	string         remark;
	string         assignment;
	string         attributes;
	time_t         createdDt = 0;
	string         createdBy;
	time_t         lastModified = -1;
	string         modifiedBy;
	time_t         startDtUtc = -1;
	time_t         endDtUtc = -1;
};

// "id", "crewId", "type", "assignment", "assignmentGroup", "preference"
struct CREW_REQUEST_RECORD {
    long long id{};
    string         crewId;
    string         type;
    string         assignment;
    string         assignmentGroup;
    string         preference;
};

// "id", "reqId", "crewId", "type", "status", "assignment", "priority", "startDate", "endDate", "pairingId", "rosterId", "lastModified", "modifiedBy"
struct CREW_REQUEST_RECORD_DETAIL {
    long long id{};
    long long reqId{};
    string         crewId;
    string         startDateLocalStr;
    string         endDateLocalStr;
    string         buddyCrewId;
    string         type;
    long long pairingId{};
    long long rosterId{};
    string         priority;
    string         status;
    string         reason;
    string         remark;
    string         assignment;
    string         attributes;
    time_t         createdDt = 0;
    string         createdBy;
    time_t         lastModified{};
    string         modifiedBy;
    time_t         startDtUtc{};
    time_t         endDtUtc{};
    time_t         startDtLoc{};
    time_t         endDtLoc{};
};

//------------ Holiday -------------
struct Holiday {
	string airline;
	time_t strDt{};//本地开始日期
	time_t endDt{};//本地结束日期
	time_t strDtUtc{};//UTC开始日期
	time_t endDtUtc{};//UTC结束日期（修正过，结束时间为23:59:59）

	string holiday;
	string country;
	string city;
	string mark;
	string doType;
};

struct QualExtensionConfig {
	long long id = 0;
	vector<string> qualifications;
	vector<string> assignments;
	int expiredBeforeDays = 0;
	int extensionTime = 0;
	string extensionUnit;
};

struct FatigueResult{
	long long id = 0;
	string crewId;
	time_t dutyStart = 0;
	time_t dutyEnd = 0;
	long long rosterId = 0;
	long long dutyId = 0;
	string fatigueIndex;
	string maxTod;
	string maxSp;
};

//针对pairing/duty分配crew后因前后overlap等产生的针对单个crew的fdp/dp调整
struct DutyValue {
	int blk = 0;
	int plnFdp = 0;
	int plnDp = 0;
	int actFdp = 0;
	int actDp = 0;
	int actWp = 0;
	int minRest = 0;//minimum rest
	int actRest = 0;//actual rest
	int mergeFdp = 0;
	int mergeBlh = 0;
	int mergeDp = 0;
	int aloftTime = 0;//空中时间，单位：分钟
    int maxFdp = 0;//根据法规计算的最大fdp，单位：分钟
    int maxDp = 0;//根据法规计算的最大dp，单位：分钟

	int deductionMaxFdp = 0;//抓飞扣减的最大FDP，单位：分钟
	int additionMinRest = 0;//增加的MinRest值，单位：分钟
	int fdpDiscretion = 0;//Max FDP Discretion，单位：分钟
	int restDiscretion = 0;//Min Rest Discretion，单位：分钟

	//适应状态相关字段
    string accState = "D"; //适应状态(本Duty开始时适应状态)，取值：A-适应，U-未知等，见AcclimatizationStateOfEASA、AcclimatizationState定义
	string accStateForRestStart = "D";//适应状态（本Duty结束时(即当前Duty结束后开始休息）适应状态)
	int refTimeZone = INT_MIN;	//适应地时区(分钟数)
    int ETRTZ = 0; //新地点适用时长。新地点适用时长=当前Duty的签到时间-最近适应状态Duty的签到时间
	int tzDiffs = 0;//适应地时区与duty起飞地点之间时区差


};
class RosterDutyValues {
public:
	static constexpr int BLK = 1 << 0; // 等价于 1 (2^0)

	static constexpr int PLN_FDP = 1 << 1; // 等价于 2 (2^1)
	static constexpr int PLN_DP = 1 << 2; // 等价于 4 (2^2)
	static constexpr int ACT_FDP = 1 << 3; // 等价于 8 (2^3)
	static constexpr int ACT_DP = 1 << 4; // 等价于 16 (2^4)
	static constexpr int ACT_REST = 1 << 5;

	static constexpr int MERGE_FDP = 1 << 6;
	static constexpr int MERGE_BLH = 1 << 7;

	static constexpr int ALOFT_TIME = 1 << 8;

	static constexpr int MIN_REST = 1 << 9;
	static constexpr int MAX_FDP = 1 << 10;
	static constexpr int MAX_DP = 1 << 11;

	static constexpr int ACC_STATE = 1 << 12;
	static constexpr int ACC_STATE_FOR_REST_START = 1 << 13;
	static constexpr int REF_TIME_ZONE = 1 << 14;
	static constexpr int ETRTZ = 1 << 15;
	static constexpr int TZ_DIFFS = 1 << 16;

public:
	void setBlk(int dutyIndex, int val);
	void setPlnFdp(int dutyIndex, int val);
	void setPlnDp(int dutyIndex, int val);
	void setActFdp(int dutyIndex, int val);
	void setActDp(int dutyIndex, int val);
	void setActWp(int dutyIndex, int val);
	void setMinRest(int dutyIndex, int val);
	void setActRest(int dutyIndex, int val);
	void setMergeFdp(int dutyIndex, int val);
	void setMergeDp(int dutyIndex, int val);
	void setMergeBlh(int dutyIndex, int val);
	void setAloftTime(int dutyIndex, int aloftTime);

	void setMaxFdp(int dutyIndex, int val);
	void setMaxDp(int dutyIndex, int val);

	void setDeductionMaxFdp(int dutyIndex, int val);
	void setAdditionMinRest(int dutyIndex, int val);
	void setFdpDiscretion(int dutyIndex, int val);
	void setRestDiscretion(int dutyIndex, int val);

	void setAccState(int dutyIndex, const std::string& val);
	void setAccStateForRestStart(int dutyIndex, const std::string& val);
	void setRefTimeZone(int dutyIndex, int val);
	void setETRTZ(int dutyIndex, int val);
	void setTzDiffs(int dutyIndex, int val);

	void clearMergeFdp();
	void clearDiscretion();
	void clearDeduction();
	int getBlk(const std::size_t dutyIndex);
	int getPlnFdp(const std::size_t dutyIndex);
	int getPlnDp(const std::size_t dutyIndex);
	int getActFdp(const std::size_t dutyIndex);
	int getActDp(const std::size_t dutyIndex);
	int getActWp(const std::size_t dutyIndex);
	int getMinRest(const std::size_t dutyIndex);
	int getActRest(const std::size_t dutyIndex);
	int getMergeFdp(const std::size_t dutyIndex);
	int getMergeDp(const std::size_t dutyIndex);
	int getMergeBlh(const std::size_t dutyIndex);
	int	getAloftTime(const std::size_t dutyIndex) const;

	int getMaxFdp(const std::size_t dutyIndex);
	int getMaxDp(const std::size_t dutyIndex);

	int getDeductionMaxFdp(const std::size_t dutyIndex) const;
	int getAdditionMinRest(const std::size_t dutyIndex) const;
	int getFdpDiscretion(const std::size_t dutyIndex) const;
	int getRestDiscretion(const std::size_t dutyIndex) const;

	std::string getAccState(const std::size_t dutyIndex);
	std::string getAccStateForRestStart(const std::size_t dutyIndex);
	int getRefTimeZone(const std::size_t dutyIndex);
	int getETRTZ(const std::size_t dutyIndex);
	int getTzDiffs(const std::size_t dutyIndex);

	int get(const std::size_t dutyIndex, string name);//name: FT/FDP/DP
	bool isCalculated(string name); //判断roster.dutyValue是否计算/是否全0, name: FT/FDP/DP
private:
	void resetList(int dutyIndex);//若dutyIndex超出list.size则增加list容量
	vector<DutyValue> list;
};
//------------ ROSTER --------------
#define       ROSTER_SOURCE_OR            0    //来自or运算结果
#define       ROSTER_SOURCE_PRE_ASSIGN    1    //来自预占
class ROSTER : public Activity {
public:
	static void printInstanceCount(string msg);
	ROSTER();
	~ROSTER();
	Pairing*  pairing;
	int       totalPayTime = 0;
	int       indexInRosterListOfCrew = 0;  //Roster 在所属crew中rosterList内的索引位置，从 0开始计数
	long long idscenario = 0;
	int       sourceType = 0; //是否预占: ROSTER_SOURCE_PRE_ASSIGN or ROSTER_SOURCE_OR
	long long pairId = 0;     //64bit integer
	long long rosterId = 0;   //64bit integer
	time_t    pairingStartDt = 0;
	long long brief = 0;
	long long debrief = 0;
	time_t    strUtc = 0;
	time_t    restStrUtc = 0;
	time_t    endUtc = 0;
	time_t    strLoc = 0;
	time_t    restStrLoc = 0;
	time_t    endLoc = 0;
	time_t    actStrUtc = 0;
	time_t    actRestStrUtc = 0;
	time_t    actEndUtc = 0;
	time_t    actStrLoc = 0;
	time_t    actRestStrLoc = 0;
	time_t    actEndLoc = 0;
	time_t    notifiedTmst = 0;
	time_t    publishedUtc = 0;
	time_t    calloutUtc = 0;
	time_t    allocTmst = 0;
	time_t    tmst = 0;

	double    creditMinutes = 0;//Credit(实际时间)
	double    fmCreditMinutes = 0;//首月Credit(实际时间)
	double    perDiemMins = 0;
	double    lhPerDiemMins = 0;
	double    fmPerDiemMins = 0;
	double    fmLhPerDiemMins = 0;
	double    schCreditMinutes = 0;//Credit(计划时间)
	double    schFmCreditMinutes = 0;//首月Credit(计划时间)
	double    schPerDiemMins = 0;
	double    schLhPerDiemMins = 0;
	double    schFmPerDiemMins = 0;
	double    schFmLhPerDiemMins = 0;

	double    workingHour = 0; //Working Hour(实际时间)
	double    schWorkingHour = 0; //Working Hour(计划时间)

	string    idcrew;
	string    label;
	string    duty; //assignment group
	string    source;
	string    actingRank;
	string    isValid;
	string    isDelete;
	string    isNotified;
	string    notifiedUser;
	string    location;
	string    isPublished;
	string    appId;
	string    allocCode;
	string    comments;
	string    uniComments;
	string    deallocCode;
	string    deallocIduser;
	string    trgActiveRank;
	string    isTraining;//??? 暂未使用
	string    swapIdStaff;
	string    ttotInd;
	string    idUser;
	string    qualifier; //assignment
	string    origin;                       //ROSTER.ORIGIN
	string    position;                     //ROSTER.POSITION
	string    role;  //op#1137
	string    subRole; //mantis#2529
	string    memo;  //2021-1-21 ain

	bool      isCallOut = false;//仅透传，不做处理
	bool      isCallOutRoster = false;
	long long callOutRosterId = 0;//该值在SBY任务上，callOutRosterId为FLY任务的Roster Id。
	string    notificationRemark;//仅透传，不做处理
	string    preference;//仅透传，不做处理
	string    createdBy;//仅透传，不做处理
	time_t    createdDt = -1;//仅透传，不做处理
	int       score = 0;//仅透传，不做处理
	string	  attribute;

	//training Manage 训练
	string tmGroupId{};//training分组
	long long tmProgramCourseId = 0;//training课程
	string tmResourceCode{}; //training课室
	string tmRole{}; //training角色
	long long tmParentProgramCourseId = 0;

	// call-out时间, utc
	time_t notificationTime = 0;

	int dpMinutes = 0;

	int       communt = 0;                  //OP#1818, for ruleSrv & editor only, do not save to DB
	bool      needRuleCheck = false;
	bool      isRequested = false;          //ROSTER.IS_REQUEST
	bool      isSwapped = false;            //mantis#2529
	bool      isMergeFdpWithNext = false;   //辅助字段, FDP merge则忽略2124/2125警告，忽略MRT不足rest变红逻辑
	bool      isMergeFdpWithBefore = false;   //辅助字段, FDP merge则忽略2124/2125警告，忽略MRT不足rest变红逻辑
	bool      isMergeFdpWithFly = false;   //辅助字段,
	string    mergeFdpAssignment;   //辅助字段,
	int       ver = 1;
	int       seqOrder = 0;                 //20180920

	bool	  isMergeDpWithBefore = false;
	bool	  isMergeDpWithNext = false;
	long long mergeDpBeforeRosterId = 0;
	long long mergeDpNextRosterId = 0;

	bool      isAgreeWork = false;  //是否同意工作

	string exceptionCode;   //异常代码，多个使用|分隔
	std::set<std::string> exceptionCodes{};

	//SGQ
	bool _isLegal = true;
	vector<string> _vilation_messages;
	RosterDutyValues dutyValues;//针对pairing/duty分配crew后因前后overlap等产生的针对单个crew的fdp/dp调整

	set<string> validBasesList; //有效基地列表
	set<string> validFleetsList; //有效机型列表
	set<string> validRanksList; //有效级别列表
	set<string> validPositionsList; //有效岗位列表
	set<string> validQualsList; //有效资质列表
	set<string> validTeamsList; //有效团队列表



	string getBase() const;
	std::size_t getDutyNums() const;

	vector<Duty*> getOperatingDuties() const;

	vector<Segment*> getOperatingSegments() const; //return operating fly segments
	bool isFromGroupBrotherScenario(vector<long long>& groupBrotherScenario) const;       //return true if 'roster.idsenario in scenario_group and not current scenario', others return false

	//规范化 sch/act start/end utc/loc
	void setStartTimeUtcSch(time_t vl);
	time_t getStartTimeUtcSch() const;
	void setEndTimeUtcSch(time_t vl);
	time_t getEndTimeUtcSch() const;
	void setStartTimeLocSch(time_t vl);
	time_t getStartTimeLocSch() const;
	void setEndTimeLocSch(time_t vl);
	time_t getEndTimeLocSch() const;
	void setStartTimeUtcAct(time_t vl);
	time_t getStartTimeUtcAct() const;
	void setEndTimeUtcAct(time_t vl);
	time_t getEndTimeUtcAct() const;
	void setStartTimeLocAct(time_t vl);
	time_t getStartTimeLocAct() const;
	void setEndTimeLocAct(time_t vl);
	time_t getEndTimeLocAct() const;

	void setRestStartUtcSch(time_t v);
	time_t getRestStartUtcSch() const;
	[[deprecated("use getRestStartUtcSch instead")]]
	time_t getRestStarUtcSch() const;
	void setRestStartLocSch(time_t v);
	time_t getRestStartLocSch() const;
	void setRestStartUtcAct(time_t v);
	time_t getRestStartUtcAct() const;
	void setRestStartLocAct(time_t v);
	time_t getRestStartLocAct() const;

	string getClassName() const;
	void copy(ROSTER* obj);
	bool isCalculated = false;
	string toReadableStr();                //信息摘要str

	void clear();

	time_t getRestStartUtc(string type) const
	{
		if (type == "SCH")
			return this->getRestStartUtcSch();
		else
			return this->getRestStartUtcAct();

	}

	//rule add
	long callinSBY_FDPMins = 0;//SBY与FDP重叠部分，计入FDP时间

	bool isTrainingRoster() const;

	bool isAllValid(const vector<string>& bases, const vector<string>& ranks, const vector<string>& fleets, const vector<string>& teams, const vector<string>& positions) const;

	bool isAllValid(const string& strBases, const string& strRanks, const string& strFleets, const string& strTeams, const string& strPositions) const;

	bool isValidQual(const vector<string>& quals) const;

	bool isValidQual(const string& strQuals) const;

	bool isValidTeam(const vector<string>& teams) const;

	bool isValidTeam(const string& strTeams) const;

    //仅适用于Duty适应状态、MinRest、MaxFDP、MAXDP等值的自动计算，其他值不适用
	void autoConfigDutyValues(const int dutyValueTypes = 0);

public:
	int getLimitationValue(const std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) const;
	limitaions* getLimiation(const std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type) const;
	//成功设置新值返回true，其他返回false
	bool setLimitationValue(std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type, int value, long long rule_id, long long ruleParamId, string overrideAbility, string classType, string description = "", string reference = "", const bool force = false, const bool locked = false, const bool isFinalChecked = true);
	void clearLimitation(std::vector<std::shared_ptr<limitaions>>& ruleLimits, RULE_LIMITATION_TYPE type); // clear limitation value for repeat use
	void clearLimitation(std::vector<std::shared_ptr<limitaions>>& ruleLimits);


	int getLimitationValue(RULE_LIMITATION_TYPE type) const;
	limitaions* getLimiation(RULE_LIMITATION_TYPE type) const;
	//成功设置新值返回true，其他返回false
	bool setLimitationValue(RULE_LIMITATION_TYPE type, int value, long long rule_id, long long ruleParamId, string overrideAbility, string classType, string description = "", string reference = "", const bool force = false, const bool locked = false, const bool isFinalChecked = true);
	void clearLimitation(RULE_LIMITATION_TYPE type); // clear limitation value for repeat use
	void clearLimitation();
private:
	//RULE: set max/min fdp/rest.....
	ThreadLocal<std::vector<std::shared_ptr<limitaions>>> _rule_limits = std::vector<std::shared_ptr<limitaions>>();
	std::vector<std::shared_ptr<limitaions>> _rule_limits_instance = std::vector<std::shared_ptr<limitaions>>();//法规单线程使用对象


	bool isAllValid(const vector<string>& checkedList, const set<string>& validList) const;
};


//------------ CREW_RANK --------------
struct CREW_RANK {
	string    acType;
	string    idCrew;
	string    rank;
	string    fleetGroup;			//ROSCRW - 1697
	string    position;
	time_t    effUtc = 0;          //不存在时为-1
	time_t    expUtc = 0;          //不存在时为-1
	time_t    probationEndUtc = 0; //不存在时为-1
	int       preCumulatedExpDays = 0;
	string    division;
};
//------------ CREW_COMPANY_RANK --------------
struct CREW_COMPANY_RANK {
	long long id = 0;
	string    idCrew;
	string    interfaceCompanyRankId;
	string    companyRank;
	time_t    effDt = 0;           //不存在时为-1
	time_t    expDt = 0;           //不存在时为-1
	time_t    probationEndDt;      //不存在时为-1
	string    companyPosition;
	int       preCumulatedExpDays = 0;
	string    fleetSpecific;
	string    acType;
	time_t    lastModified = -1;
	string    modifiedBy;

};
//------------ CREW_FLEET --------------
struct CREW_FLEET {
	string    idCrew;
	string    fleet;
	time_t      effUtc = 0;          //不存在时为-1
	time_t      expUtc = 0;          //不存在时为-1
};
//------------ CREW_BASE --------------
struct CREW_BASE {
	string    idCrew;
	string    base;
	time_t      effUtc = 0;          //不存在时为-1
	time_t      expUtc = 0;          //不存在时为-1
	time_t      effLoc = 0;
	time_t      expLoc = 0;
	bool      isPrime = true;         //是否prime base
};
//------------ CREW_Qualification --------------
struct CREW_QUALIFICATION {
	string    idCrew;
	string    qual;
	time_t      issuedUtc = -1;
	time_t      renewedUtc = -1;
	time_t      expiryUtc = -1;
	time_t      cancelUtc = -1;
	time_t		invaildUtc = -1;
	time_t		earliestUtc = -1;
	time_t		latestUtc = -1;
	int		  languageLevel = -1;
	string    status;
	string    fleetGrp;
	string    rank;
	string    reference;
	string    issuingAuthority;
	string    issuingPlace;
	string    qualFirstName;
	string    qualMidName;
	string    qualLastName;
	string    cancelReason;
	string    remark;
	time_t      lastActivityUtc = -1;
	string    acType;
	bool      isValid = true;
	int       basicMonth = 0;
	int       basicMonth2 = 0;
	long long baseMonthStartUtc = 0;
	long long baseMonthEndUtc = 0;
	string    referencePassNo;
	bool	  isCtaSend = false;
	bool	  isMclSend = false;
	time_t		projectionExpiryDate = -1;
	CREW_QUALIFICATION();
};
//------------ CREW_STATUS ------------
struct CREW_STATUS {
	string idcrew;
	string status;
	string reason;
	string description;
	time_t effDt = 0;
	time_t expdt = 0;
	string disable;
};
//------------ Crew_Team -----------
struct CREW_TEAM {
	string idcrew;
	long long team_id = 0;
	string teamName;
	string role;
	int minInstructingHour = 0;
	time_t effDt = -1;
	time_t expDt = -1;
	bool isValid = true;
};
//------------ CREW_GUARANTEE_HOUR --------------
struct CREW_GUARANTEE_HOUR {
	long long    id = 0;
	string    idCrew;
	time_t    effDt = 0;          //不存在时为-1
	time_t    expDt = 0;          //不存在时为-1
	int    guaranteeHour = 0;
	string    modifiedBy;
	time_t    lastModified = -1;
};
//------------ CREW_SENIORITY --------------
struct CREW_SENIORITY {
	long long    id = 0;
	string    idCrew;
	int		  serviceDay = 0;
	double	  seniority = 0.0;
	string    modifiedBy;
	time_t    lastModified = -1;
};
//-----------------crew_kpi_adjust ----------------
struct CrewKpiAdjust : public std::enable_shared_from_this<CrewKpiAdjust> {
	long long id = 0;
	string idCrew;
	long long rosterFlightId = 0;
	long long fltId = 0;
	int type = 0;//0：调整的是 credit hours(计薪时长), 1：调整的是 perdiem hours(津贴时长)
	time_t adjustDate = -1;
	int adjustment = 0;//单位：分钟
	string comments;
	string createdBy;
	time_t createdDt = -1;
	string modifiedBy;
	time_t lastModified = -1;

	std::shared_ptr<CrewKpiAdjust> getPtr() {
		return shared_from_this();
	}
};

//-----------------crew_rp_recency ----------------
struct CrewRpRecency : public std::enable_shared_from_this<CrewRpRecency> {
	long long id = 0;
	string idCrew;
	string rpName;//Roster Period name
	time_t rpStart{};//RP开始时间
	time_t rpEnd{};//RP结束时间
	string types;//统计数据的分类
	string fleet;//机型
	string fleetGroup;//机型组
	string airport;//机场
	int airportTimes{};//经过机场的次数（Roster Period内）
	int blkMin{};//统计的飞时（分钟数）（Roster Period内）
	string modifiedBy;
	time_t lastModified = -1;

	std::shared_ptr<CrewRpRecency> getPtr() {
		return shared_from_this();
	}
};

//------------ TmTrainingConfig ------------
class TmTrainingConfig : public Entity {
public:
	long long id{};
	string category{};//分类。FOOTPRINT_TYPE, FOOTPRINT_GROUP
	string tmName{};//值
	long long parentId{};//父ID
	string tmCode{};//代码
	int displayOrder{};//展示顺序
	string description{};//描述
	bool enableStatus{false};//启用状态,true-启用，false-未启用
	time_t lastModified{};
	string modifiedBy{};
};

//------------ TmCourse ------------
class TmCourse : public Entity {
public:
	long long id = 0;
	string courseName;
	string courseCode;
	string courseDesc;
	time_t effDate = -1;
	time_t expDate = -1;
	string courseType;
	string structure;
	string deviceType;
	string deviceOption;

	string deviceGroup;//多值用|分割，或关系
	vector<string> deviceGroups;

	string division;
	string projectQual;
	std::vector<std::string> projectQuals;

	string startTimeOption;//可能为空，取值：Suggestion、Must
	string startTime;//格式：HH:mm，多值用逗号（|)分割
	vector<int> startTimeMinutes;//startTime解析成分钟数

	string timePeriodOption;//可能为空，取值：Suggestion、Must
	string timePeriod;//格式：HH:mm-HH:mm，多值用逗号（|)分割
	vector<int> timePeriodStartMinutes;//timePeriod解析成分钟数，开始时间
	vector<int> timePeriodEndMinutes;//timePeriod解析成分钟数，结束时间

	int briefTime = -1;
	string briefApplicable;
	int debriefTime = -1;
	string debriefApplicable;
	int circle = -1;
	int traineeNumMin = -1;
	int traineeNumMax = -1;
	string traineeBase;
	string traineeRank;
	string traineeFleet;
	string traineeTeam;
	string checkPoint;
	int instructorNumMin = -1;
	int instructorNumMax = -1;
	string instructorQual;
	bool needObs = false;//是否需要obs，true：是 false：否
	int checkerNumMin = -1;
	int checkerNumMax = -1;
	string checkerQual;
	string lineAttr;
	time_t createTime = -1;
	string status;
	int sector = -1;
	string assignment;
	string assignmentGroup;
	string modifiedBy;
	time_t lastModified = -1;
	bool tmCreditFlag = false;
	string courseComments;

	string strDayOfWeek;//训练日期,周一到周日，多个逗号分割，例如:1,2,3,4,5,6,7
	vector<int> dayOfWeeks;//训练日期，1-7代表周一到周日

	int trainingDays = -1;//连续训练天数
	int	restDays = -1;//训练后休息天数
	int maxHoursPerDay = -1; //每日最大训练时数

	int gapBefore = -1;//前置间隔天数 X
	int gapAfter = -1; //后置间隔天数 Y
	string gapRestriction; //间隔期任务限制,取值：restOnly（仅允许 assignment group = REST）、noTrainingDuties（不可安排 training 任务）

};

//------------ TmCourseBrief ------------
class TmCourseBrief : public Entity {
public:
	long long id = 0;
	long long courseId = 0;

	string strBriefRoles; //多个之间用逗号分隔
	vector<string> briefRoles;

	int briefType = 0;//签到和签出类型：1-brief，2-debrief
	int briefTimes = 0;//分钟数
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmCourseRole ------------
class TmCourseRole : public Entity {
public:
	long long id = 0;
	int minCapacity = -1;
	int maxCapacity = -1;
	long long courseId = 0;
	string role;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmCourseDuration ------------
class TmCourseDuration : public Entity {
public:
	long long id = 0;
	long long courseId = 0;
	int num = -1;
	int duration = -1;//分钟数
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmCourseRoleBase ------------
//课程角色所在基地Base、级别Rank、机型Fleet、
class TmCourseRoleBase : public Entity {
public:
	long long id = 0;
	long long tmCourseRoleId = 0;

	string base;//基地，多值用|分割。ALL 或 * 表示所有
	vector<string> bases;

	string rank;//级别，多值用|分割。ALL 或 * 表示所有
	vector<string> ranks;

	string fleet;//机型，多值用|分割。ALL 或 * 表示所有
	vector<string> fleets;

	string team;//团队，多值用|分割。ALL 或 * 表示所有
	vector<string> teams;

	string actingRank;//机上岗位，多值用|分割。ALL 或 * 表示所有
	vector<string> actingRanks;

	bool operating = true;

	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmCourseRoleQual ------------
class TmCourseRoleQual : public Entity {
public:
	long long id = 0;
	long long tmCourseRoleId = 0;
	long long tmCourseRoleBaseId = 0;
	
	string condition;//取值：OR、AND
	
	string qual;//多值用|分割
	vector<string> quals;//多值用|分割
	
	int peopleLimit = -1;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmCourseRoleDevice ------------
class TmCourseRoleDevice : public Entity {
public:
	long long id = 0;
	long long tmCourseRoleId = 0;
	long long tmCourseRoleBaseId = 0;
	string option;//可能为空，取值：Suggestion、Must
	
	string deviceType;//多值用|分割
	vector<string> deviceTypes;

	string deviceCode;//多值用|分割
	vector<string> deviceCodes;

	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmFootprint ------------
class TmFootprint : public Entity {
public:
	long long id = 0;
	string name;
	int level = -1;;
	long long parentId = 0; //父类id，默认是0 代表最外层
	string footprintDesc;
	string footprintVer;
	int recurrentFlag = -1;//是否复训

	string footprintQual;//大纲资质目标，多值用|分割
	vector<string> footprintQuals;

	string allQual;//课程 + 大纲资质目标，多值用|分割
	vector<string> allQuals;

	string division;//适用部门

	string crewBase;//多值用|分割
	vector<string> crewBases;

	string crewRank;//多值用|分割
	vector<string> crewRanks;

	string crewFleet;//多值用|分割
	vector<string> crewFleets;

	string crewTeam;//多值用|分割
	vector<string> crewTeams;

	time_t effDate = 0;//生效时间
	time_t expDate = 0;//失效时间
	string status;

	int courseSequence = 0; //课程数量
	string footprintType; //课程类型
	string footprintSubType; //课程子类型
	int footprintLevel = -1; //大纲级别

	time_t createTime = 0;
	string modifiedBy;
	time_t lastModified = 0;
};


//------------ TmFootprintCourse ------------
class TmFootprintCourse : public Entity {
public:
	long long id = 0;
	long long footprintId = 0;//大纲主键
	long long courseId = 0;//课程主键
	string phase;//阶段名称（训练小阶段）
	int seq = -1;
	int duration = 0;
	string unit;
	int totalSession = 0;
	string assignment;
	string courseType;//课程类型。course or other
	int sector = -1;
	string simioe;//SIM或IOE阶段（训练大阶段）
	string coursePreposition; //前置与某些seq。多值用 ,分割
	int courseLevel = -1;//课程级别。高等级不可以删改低等级的课程
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmFootprintCourseTrainee ------------
class TmFootprintCourseTrainee : public Entity {
public:
	long long id = 0;
	long long footprintId = 0;
	long long footprintCourseId = 0;
	double duration = 0;
	string unit;
	string startTimeOption;
	string startTime;
	vector<int> startTimeMinutes;
	string timePeriodOption;
	string timePeriod;
	vector<int> timePeriodStartMinutes;
	vector<int> timePeriodEndMinutes;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmFootprintCourseSector ------------
class TmFootprintCourseSector : public Entity {
public:
	long long id = 0;
	long long footprintCourseId{};
	int sector = -1;
	std::string airportStr;
	std::vector<std::string> airports;
};

//------------ TmFootprintCourseIpRole ------------
class TmFootprintCourseIpRole : public Entity {
public:
	long long id{};
	long long footprintId{};
	long long footprintCourseId{};
	long long footprintTraineeId{};

	string base;
	vector<string> bases;

	string rank;
	vector<string> ranks;

	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmFootprintCourseIpRoleBase ------------
class TmFootprintCourseIpRoleBase : public Entity {
public:
	long long id{};
	long long footprintId{};
	long long footprintCourseId{};
	long long footprintTraineeId{};
	long long footprintCourseIpRoleId{};

	string fleet;
	vector<string> fleets;

	string team;
	vector<string> teams;

	string actingRank{};
	vector<string> actingRanks{};

	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmFootprintCourseIpRoleQual ------------
class TmFootprintCourseIpRoleQual : public Entity {
public:
	long long id{};
	long long footprintId{};
	long long footprintCourseId{};
	long long footprintTraineeId{};
	long long footprintCourseIpRoleId{};
	long long footprintCourseIpRoleBaseId{};

	string roleQualOption{};
	string roleQual{};
	vector<string> roleQuals{};

	int roleNumber{};

	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmFootprintCourseRole ------------
class TmFootprintCourseRole : public Entity {
public:
	long long id{};
	long long footprintId{};//大纲ID
	long long footprintCourseId{};
	long long footprintTraineeId{};

	string base;//基地，多值用|分割。ALL 或 * 表示所有
	vector<string> bases;

	string rank;//级别，多值用|分割。ALL 或 * 表示所有
	vector<string> ranks;

	string fleet;//机型，多值用|分割。ALL 或 * 表示所有
	vector<string> fleets;

	string team;//团队，多值用|分割。ALL 或 * 表示所有
	vector<string> teams;

	string actingRank{}; //机上岗位，多值用|分割。ALL 或 * 表示所有
	vector<string> actingRanks{};

	string role{}; //角色
	int roleNumber{ -1 };//角色数量

	string roleType{};//取值：IP、OTHER_ROLE
	bool needPip{ false };//是否需要pip。true:需要pip false:不需要pip
	string modifiedBy{};
	time_t lastModified{};

};

//------------ TmFootprintCourseRoleQual ------------
//footprint course Role 资质信息
class TmFootprintCourseRoleQual : public Entity {
public:
	long long id{};
	long long footprintId{}; //大纲ID
	long long footprintCourseId{}; //footprint课程id
	long long footprintTraineeId{}; //关联id
	long long footprintCourseRoleId{};//TmFootprintCourseRole的ID
	string roleQualOption{};//选项条件，取值: OR、MUST

	string roleQual{};//资质列表，多值用|分割。ALL 或 * 表示所有
	vector<string> roleQuals{};

	int roleNumber{};//特地资质的角色数量
	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmFootprintCourseRoleLimitation ------------
class TmFootprintCourseRoleLimitation : public Entity {
public:
	long long id{};
	long long footprintId{};
	long long footprintCourseId{};
	long long footprintTraineeId{};
	long long footprintCourseRoleId{};
	string limitOption{};//取值：Must Same、must not same

	string limitSeq{};//限制的ID，这里特指课程ID，多个使用|分隔。TM_FOOTPRINT_COURSE.SEQ
	vector<string> limitCourseSeqs{};

	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmFootprintPip ------------
class TmFootprintPip : public Entity {
public:
	long long id = 0;
	long long footprintId = 0;//大纲主键
	string simioe;//SIM或IOE阶段（大阶段）
	string phase;//阶段名称（小阶段）
	int pipNumber = 0;
	string strCrewIds;
	vector<string> crewIds;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgram ------------
class TmProgram : public Entity {
public:
	long long id = 0;
	string name;
	string programDesc;
	long long footprintId = 0;
	int recurrentFlag = -1;
	time_t startDate = 0;
	time_t endDate = 0;
	string status;
	string crewId;
	string crewName;
	int buddyType = -1;
	time_t firstDutyDate = -1;
	long long firstDutyDateId = 0;
	string firstDutyDateType;
	int courseSequence = -1;
	string footprint;
	string generationMethod;
	string createUser;
	time_t createTime = 0;
	string modifiedBy;
	time_t lastModified = 0;

	inline bool isSoloCourse() const {
		return generationMethod == "SOLO COURSE AUTOMATIC GENERATION";
	}
};

//------------ TmProgramBuddy ------------
//计划课程伙伴Buddy，buddy也是学员是同一节课同组（学习组）的学员。二个学员相互为buddy
class TmProgramBuddy : public Entity {
public:
	long long id = 0;
	long long tmProgramId = 0;
	string crewId;//培训计划program的crew
	string buddyId;//该crew对应伙伴buddy学员的crewId
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramBuddyTime ------------
//计划课程伙伴Buddy时间
class TmProgramBuddyTime : public Entity {
public:
	long long id = 0;
	long long tmProgramBuddyId = 0;//关联的TmProgramBuddy.Id
	long long buddyProgramId = 0;//关联的TmProgramBuddy.buddyId（crewId）学员的TmProgram.Id

	string startTime;//课程开始时间(yyyy/mm/dd hh:mm:ss)或开始课程(来自TM_PROGRAM_BUDDY_COURSE.COURSE_ID)
	string endTime;//课程结束时间(yyyy/mm/dd hh:mm:ss)或结束课程(来自TM_PROGRAM_BUDDY_COURSE.COURSE_ID)
	time_t courseStartTime = -1;//课程开始时间。“courseStartTime和courseEndTime” 与 “fromCourseId和 toCourseId" 组合相互排他
	time_t courseEndTime = -1; //课程结束时间
	long long fromCourseId = 0;//开始课程。来自:TM_PROGRAM_BUDDY_COURSE.COURSE_ID
	long long toCourseId = 0;//结束课程。来自:TM_PROGRAM_BUDDY_COURSE.COURSE_ID

	int startCoursePhase = -1;
	int endCoursePhase = -1;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramBuddyCourse ------------
class TmProgramBuddyCourse : public Entity {
public:
	long long id{};
	long long programId{};
	long long courseId{};
	long long programBuddyId{};
	long long programBuddyTimeId{};
	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmProgramPip ------------
//训练计划各阶段的IP/CK人员数量配置
class TmProgramPip : public Entity {
public:
	long long id = 0;
	long long programId = 0;//培训计划ID
	string simioe;//SIM或IOE阶段（训练大阶段）
	string strPhase;//阶段名称（训练小阶段）, 多个使用|分隔
	vector<string> phase;
	int pipNumber = 0;//EVA仅包括IP角色人员数量，其他航司可能包括IP、CK二种角色人员数量
	string strCrewIds;
	vector<string> crewIds;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramCourse ------------
//存储学员安排课程表
class TmProgramCourse : public Entity {
public:
	long long id = 0;
	long long programId = 0;
	long long courseId = 0;
	time_t plannedDate = 0;
	time_t rosterDate = 0;
	long long rosterId = 0;
	long long rosterGroundId = 0;
	string resourceCode;
	string groupId;  //教员/检查员、伙伴、学员等安排相同课程则groupId相同
	long long parentId = 0;
	string role;
	time_t startTime = 0;
	time_t endTime = 0;
	int publishFlag = -1;
	string coursePhase;//阶段名称（训练小阶段）
	string courseSeq;//课程序号，字符串类型(浮点类型转换成字符串)
	double courseSortSeq;//课程序号,浮点类型用于排序使用
	string crewId;

	long long fltId = 0;
	string fleet;//机型
	string depStation;//起飞机场
	string arrStation;//落地机场
	time_t actStartTimeUtc = 0;//实际起飞时间(按优先级 实际时间>预计时间>计划时间)
	time_t actEndTimeUtc = 0;//实际落地时间(按优先级 实际时间>预计时间>计划时间)
	string rfAssignment; //来自RosterFlight的Assignment

	long long deviceTimeId = 0;
	string simioe; //SIM或IOE阶段（训练大阶段）
	
	string coursePreposition;//前置与某些seq。多值用 | 分割
	set<string> coursePrepositions;//拆分coursePreposition

	string status;//状态
	bool isExtraCourse = false;//是否加课
	string trainingResult; //训练结果

	long long subTmProgramCourseId = 0;//该学员同时作为另一节课程学员(即子课程)的ProgramCourse的Id，目前该无业务场景，但功能支持

	std::string source{"PA"};

	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramCourseInstructor ------------
//存储教员、检查员、伙伴等（非学员）安排课程表
class TmProgramCourseInstructor : public Entity {
public:
	long long id = 0;
	long long programCourseId = 0;//废弃不用
	string crewId;
	string role;//取值：Instructor、Trainee、IP
	long long rosterId = 0;
	long long rosterGroundId = 0;

	long long fltId = 0;
	string rfAssignment; //来自RosterFlight的Assignment

	string groupId;//教员/检查员、伙伴、学员等安排相同课程则groupId相同
	string resourceCode; //设备code
	time_t startTime = 0; //课程开始时间
	time_t endTime = 0; //课程结束时间
	long long courseId = 0; //课程id
	int publishFlag = -1; //发布标志，1-已发布，0-未发布

	long long subTmProgramCourseId = 0;//该教员同时作为另一节课程学员(即子课程)的ProgramCourse的Id

	std::string source{"PA"};
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramCourseLimitation ------------
class TmProgramCourseLimitation : public Entity {
public:
	long long id{};
	long long programId{};
	long long programCourseId{};
	long long programCoursePnrId{};

	string limitOption{};//取值：Must Same、must not same
	string limitSeq{};//限制的ID，这里特指课程ID，多个使用|分隔。关联TM_PROGRAM_COURSE.COURSE_SEQ
	vector<string> limitCourseSeqs{};

	string startRole; //当前课程programCourseId的角色，多个使用|分隔
	vector<string> startRoles;
	string endRole; //其他课程(当前program中limitSeq课程)的角色，多个使用|分隔
	vector<string> endRoles;

	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmProgramCourseRole ------------
class TmProgramCourseRole : public Entity {
public:
	long long id{};
	long long programId{};
	long long programCourseId{};
	long long programCoursePnrId{};//programCoursePnr的ID

	string base;//基地，多值用|分割。ALL 或 * 表示所有
	vector<string> bases;

	string rank;//级别，多值用|分割。ALL 或 * 表示所有
	vector<string> ranks;

	string fleet;//机型，多值用|分割。ALL 或 * 表示所有
	vector<string> fleets;

	string team;//团队，多值用|分割。ALL 或 * 表示所有
	vector<string> teams;

	string actingRank{}; //机上岗位，多值用|分割。ALL 或 * 表示所有
	vector<string> actingRanks{};

	string role{};//角色
	int roleNumber{-1};//角色数量

	string roleType{};//取值：IP、OTHER_ROLE

	bool needPip{false};//是否需要pip。true:需要pip false:不需要pip
	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmProgramCourseRoleQual ------------
class TmProgramCourseRoleQual : public Entity {
public:
	long long id{};
	long long programId{};
	long long programCourseId{};
	long long programCoursePnrId{};
	long long programCourseRoleId{};

	string roleQualOption{};//选项条件，取值: OR、MUST
	string roleQual{};//资质列表，多值用|分割。ALL 或 * 表示所有
	vector<string> roleQuals{};

	int roleNumber{};//特地资质的角色数量

	string modifiedBy{};
	time_t lastModified{};

};

//------------ TmProgramCourseRoleLimitation(废弃) ------------
class TmProgramCourseRoleLimitation : public Entity {
public:
	long long id{};
	long long programId{};
	long long programCourseId{};
	long long programCoursePnrId{};
	long long programCourseRoleId{};

	string limitOption{};//取值：Must Same、must not same
	string limitSeq{};//限制的ID，这里特指课程ID，多个使用|分隔。关联TM_PROGRAM_COURSE.COURSE_SEQ
	vector<string> limitCourseSeqs{};

	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmProgramCourseIpRelevance（废弃） ------------
//存储TmProgramCourse和TmProgramCourseInstructor关系表
class TmProgramCourseIpRelevance : public Entity {
public:
	long long id = 0;
	long long programCourseId = 0;
	long long programCourseInstructorId = 0;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramCourseIpRole ------------
class TmProgramCourseIpRole : public Entity {
public:
	long long id{};
	long long programId{};
	long long programCourseId{};
	long long programCoursePnrId{};//programCoursePnr的ID

	string base;//基地，多值用|分割。ALL 或 * 表示所有
	vector<string> bases;

	string rank;//级别，多值用|分割。ALL 或 * 表示所有
	vector<string> ranks;

	string modifiedBy{};
	time_t lastModified{};
};


//------------ TmProgramCourseIpRoleBase ------------
class TmProgramCourseIpRoleBase : public Entity {
public:
	long long id{};
	long long programId{};
	long long programCourseId{};
	long long programCoursePnrId{};//programCoursePnr的ID
	long long programCourseIpRoleId{};//TmProgramCourseIpRole的ID

	string fleet;//机型，多值用|分割。ALL 或 * 表示所有
	vector<string> fleets;

	string team;//团队，多值用|分割。ALL 或 * 表示所有
	vector<string> teams;

	string actingRank{}; //机上岗位，多值用|分割。ALL 或 * 表示所有
	vector<string> actingRanks{};

	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmProgramCourseIpRoleQual ------------
class TmProgramCourseIpRoleQual : public Entity {
public:
	long long id{};
	long long programId{};
	long long programCourseId{};
	long long programCoursePnrId{};
	long long programCourseIpRoleId{};//TmProgramCourseIpRole的ID
	long long programCourseIpRoleBaseId{};//TmProgramCourseIpRoleBase的ID

	string roleQualOption{};//选项条件，取值: OR、MUST
	string roleQual{};//资质列表，多值用|分割。ALL 或 * 表示所有
	vector<string> roleQuals{};

	int roleNumber{};//特地资质的角色数量，若不配置roleNumber，则数量上限不做限制（即最小1个）

	string modifiedBy{};
	time_t lastModified{};

};

//------------ TmProgramCoursePnr ------------
class TmProgramCoursePnr : public Entity {
public:
	long long id = 0;
	long long programId = 0;
	long long tmProgramCourseId = 0;
	long long tmPairingChartId = 0;
	double duration = 0;//计划课程持续时间，保留2小数
	string unit;//计划课程持续时间单位，取值：H - 小时数, M - 分钟数，Leg - 航段
	
	string startTimeOption;//可能为空，取值：Suggestion、Must
	string startTime;//格式：HH:mm，多值用逗号（,)分割
	vector<int> startTimeMinutes;//startTime解析成分钟数

	string timePeriodOption;//可能为空，取值：Suggestion、Must
	string timePeriod;//格式：HH:mm-HH:mm，多值用逗号（,)分割
	vector<int> timePeriodStartMinutes;//timePeriod解析成分钟数，开始时间
	vector<int> timePeriodEndMinutes;//timePeriod解析成分钟数，结束时间

	string attainedQual;
	bool needObs = false;//是否需要obs。true:需要obs false:不需要obs。已废弃
	bool needPip = false;//是否需要pip。true:需要pip false:不需要pip。已废弃
	int pipNumber = -1; //已废弃
	int pnrNumber = -1; //已废弃

	string pnrBase;//多值用|分割。已废弃
	vector<string> pnrBases;//存储解析pnrBase的值。已废弃
	
	string pnrRank;//多值用|分割。已废弃
	vector<string> pnrRanks;//存储解析pnrRank的值。已废弃
	
	string pnrFleet;//多值用|分割。已废弃
	vector<string> pnrFleets;//存储解析pnrFleets的值。已废弃
	
	string pnrTeam;//多值用|分割。已废弃
	vector<string> pnrTeams;//存储解析pnrTeam的值。已废弃

	string pnrQualOption; //取值：OR、AND。已废弃
	string pnrQual;//多值用|分割。已废弃
	vector<string> pnrQuals;//存储解析pnrQual的值。已废弃

	string teActingRank; //学员机上岗位，多值用|分割。ALL 或 * 表示所有
	vector<string> teActingRanks;

	string teRole;//学员角色，多值用|分割。ALL 或 * 表示所有
	vector<string> teRoles;

	string teConfigurableCourse;

	string subIpRole; //sub course的IP角色

	string strDayOfWeek;//训练日期,周一到周日，多个逗号分割，例如:1,2,3,4,5,6,7
	vector<int> dayOfWeeks;//训练日期，1-7代表周一到周日

	int trainingDays = -1;//连续训练天数
	int	restDays = -1;//训练后休息天数
	int maxHoursPerDay = -1; //每日最大训练时数

	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramCourseIpck ------------
class TmProgramCourseIpck : public Entity {
public:
	long long id = 0;
	long long programId = 0;
	long long tmProgramCourseId = 0;
	long long tmProgramCoursePnrId = 0;

	string ipckQualOption;//取值：OR、AND

	string ipckQual;//IP/CK资质，多值用|分割
	vector<string> ipckQuals;//存储解析ipckQual的值

	int ipckNumber = -1;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramCourseMore ------------
class TmProgramCourseMore : public Entity {
public:
	long long id = 0;
	long long programId = 0;
	long long tmProgramCourseId = 0;
	long long tmProgramCoursePnrId = 0;
	string dependence;
	int minGap = -1;
	int maxGap = -1;
	string legStation;//取值：leg：在某站点起飞和落地各计算1次 or station 某站点起飞和落地算计算1次
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmProgramCourseMoreLeg ------------
//仅针对courseType=LINE课程约束
class TmProgramCourseMoreLeg : public Entity {
public:
	long long id{};
	long long programId{};
	long long tmProgramCourseId{};
	long long tmProgramCoursePnrId{};
	long long tmProgramCourseMoreId{};

	string legCategory{};//选择program course的分类。取值：Phase、Course
	string legPhase{};//检查Line的program course范围，可以为“空”表示不受限制（1）legCategory=Phase，填写program的小phase，多个|分隔。tmProgramCourseId排课后，才进行检查（2）legCategory=Course，填写program course seq（父课程），多个|分隔。tmProgramCourseId排课后，才进行检查
	vector<string> legPhases{};

	//所有program course的Leg集合，按时间排序
	string legRange{};//leg范围，取值：Between 、After、Before
	string strLegBefore{};//leg头，字符串
	int legBefore{-1};//leg头，整型，从1开始
	string strLegAfter{};//leg尾，字符串
	int legAfter{-1};//leg尾，整型

	//航段航站要求（告警条件）
	string legForce{};//leg要求，取值：goToOne 所有站点去一个即可、mustGo 所有站点必须都去 、mustNotGo 所有站点都不能去

	string legStation{};//航段的航站列表，多个使用|分隔，来自TM_TRAINING_CONFIG的category为FOOTPRINT_GROUP（注意存在父子关系，这里存储父节点，具体数据存储在子节点）
	vector<string> legStations;
	string legGroup{};//航段的航站组，多个使用|分隔。legStation与legGroup合并成所有航段站点
	vector<string> legGroups;
	set<string> allLegStations; //legStation+legGroup组成的最后用于检查的航站

	string legPassenger{};//选择航段的运载要求（客货机） 取值：ALL-货机和客机，Cargo Flight：货机B77X，Passenger Flight：客机

	//航段数量要求（告警条件）
	int legSector{-1};//满足的最小航段数量(小于等于0，不受限制)，选中program course中满足最小航段数量。实际legSector计算依赖 TmProgramCourseMore.legStation条件

	time_t lastModified{};
	string modifiedBy{};

public:
	void makeAllLegStations(const CrewDataContext* dbData);
};
//
//------------ TmDevice ------------
class TmDevice : public Entity {
public:
	long long id = 0;
	string resourceCode;

	string resourceType;//多值用|分割
	vector<string> resourceTypes;
	
	string resourceDesc;//取首字母存储到 deviceType 中

	string facilityName;
	string port;
	string facilityAddress;
	string telephone;
	int roomCapacity = -1;
	string slotCode;
	string deviceType;
	string fleet;
	string fleetGrp;
	int publishStatus = -1;
	string simId;
	string modifiedBy;
	time_t lastModified = 0;

	time_t expirationDateLoc = 0;//设备过期时间的本地时间
	time_t effectiveDateLoc = 0;//设备生效时间的本地时间
};

//------------ TmDeviceTime ------------
class TmDeviceTime : public Entity {
public:
	long long id = 0;
	string resourceCode;
	string startTime;//格式：HH:mm
	string endTime;//格式：HH:mm
	string startDate;//格式：yyyy-MM-dd
	string endDate;//格式：yyyy-MM-dd

	std::string startTimeUtcStr;
	std::string endTimeUtcStr;
	std::string startTimeLocStr;
	std::string endTimeLocStr;

	time_t startTimeUtc = 0;
	time_t endTimeUtc = 0;
	time_t startTimeLoc = 0;
	time_t endTimeLoc = 0;

	std::string courseCodes;
	std::vector<std::string> courseCodeList;
	std::string footprintNames;
	std::vector<std::string> footprintNameList;

	int startTimeMinutes = 0;//startTime（HH:mm）分钟数
	int endTimeMinutes = 0;//endTime（HH:mm）分钟数
	time_t startDateLoc = 0; //startDate的本地天
	time_t endDateLoc = 0;//endDate的本地天

	std::string source{"PA"};

	int peopleLimit = -1;
	string status;//取值：N：不可用，U_O:手动占用 U_F:SIM航班占用 U_R:排班占用， ALL或空: 可用
	string operationReason;
	time_t createTime = 0;
	string modifiedBy;
	time_t lastModified = 0;
};

//------------ TmPairingChart ------------
class TmPairingChart : public Entity {
public:
	long long id{};
	int buddyNumber{};//buddy伙伴数量
	time_t effDt{-1};//生效日期，program的开始时间在有效期内[eff_dt,exp_dt)
	time_t expDt{-1};//失效日期

	string rankMatch{};//学员和伙伴的rank，中间使用逗号分隔。格式：学员Rank列表,buddy 1的Rank列表, buddy 2的Rank列表, ....。例如：SFO|FFO,SFO|FFO,SFO|FFO
	vector<string> teRanks;//学员的rank
	vector<vector<string>> allBuddyRanks;//buddy伙伴Rank列表。allBuddyRanks.size()与buddyNumber数量一致

	double duration{};//时长，单位：小时H
	int durationMinutes;//时长，单位：分钟数

	string modifiedBy{};
	time_t lastModified{};
};


//------------ TmPairingChartRole ------------
class TmPairingChartRole : public Entity {
public:
	long long id{};
	long long pairingChartId{};

	string base;//基地，多值用|分割。ALL 或 * 表示所有
	vector<string> bases;

	string rank;//级别，多值用|分割。ALL 或 * 表示所有
	vector<string> ranks;

	string fleet;//机型，多值用|分割。ALL 或 * 表示所有
	vector<string> fleets;

	string team;//团队，多值用|分割。ALL 或 * 表示所有
	vector<string> teams;

	string actingRank{}; //机上岗位，多值用|分割。ALL 或 * 表示所有
	vector<string> actingRanks{};

	int roleNumber{-1};

	string footprintId;//Footprint的ID列表，多值用|分割
	vector<long long> footprintIds;

	string modifiedBy{};
	time_t lastModified{};

};

//------------ TmPairingChartRoleQual ------------
class TmPairingChartRoleQual : public Entity {
public:
	long long id{};
	long long pairingChartId{};
	long long pairingChartRoleId{};

	string roleQualOption{};//选项条件，取值: OR、MUST

	string roleQual{};//资质列表，多值用|分割。ALL 或 * 表示所有
	vector<string> roleQuals{};

	string modifiedBy{};
	time_t lastModified{};
};

//------------ TmPairingChartCourse ------------
class TmPairingChartCourse : public Entity {
public:
	long long id{};
	long long pairingChartId{};
	long long courseId{};

	string modifiedBy{};
	time_t lastModified{};
};

//------------ RulePhaseConfig ------------
class RulePhaseConfig : public Entity {
public:
	long long id{};
	string phaseName{}; //阶段名称

	string strDtType{}; //开始时间类型：1=today, 2=publish day, 3=other
	string strDtRange{}; //开始时间为 other 的范围方向：1=Next, 2=Past
	int strDtRangeDays{}; //开始时间为 other 的天数/小时数
	string strDtRangeUnit;//strDtRangeDays的单位：1=天Day, 2=小时Hour
	string strDtRangeType{};//开始时间为 other 的基准类型：1=today, 2=publish day

	string endDtType{}; //结束时间类型：1=today, 2=publish day, 3=other
	string endDtRange{}; //结束时间为 other 的范围方向：1=Next, 2=Past
	int endDtRangeDays{}; //结束时间为 other 的天数/小时数
	string endDtRangeUnit; //endDtRangeDays的单位：1=天Day, 2=小时Hour
	string endDtRangeType{}; //结束时间为 other 的基准类型：1=today, 2=publish day

	int showIndex{}; //显示顺序

	time_t modifiedBy{};
	time_t lastModified{};
public:
    time_t getStartTimeUtc(const time_t nowUtc, const time_t lastPublishDateUtc = -1, const int offsetTZMinutes = -1) const;

	time_t getEndTimeUtc(const time_t nowUtc, const time_t lastPublishDateUtc = -1, const int offsetTZMinutes = -1) const;
};

//---------DutyCodeLogic---------
struct DutyCodeLogic {
	long long id{}; //主键id

	long long dutyCodeTypeCompId{}; //duty_code_type_comp表id

	string pairComp{}; //环的配比.exp:1+1

	string dep{}; //起飞机场

	string arr{}; //到达机场

	bool isSingleSeg{}; //是否duty内唯一segment :N/Y

	string dutyCodeType{}; //取Duty Code Type 配置表

	string dutyCode{}; //Duty Code

	int priority{}; //优先级，数值越小优先级越高

	//string modifiedBy{};
	//time_t lastModified{};

};

//---------DutyCodeTypeComp---------
struct DutyCodeTypeComp {
	long long id{}; //主键id

	string dutyAssignment{}; //Duty Assignment，例如：FLY

	string comp{}; //配比,例如：2P,  其中 N/A 表示空配比

	string option{}; //搭配方案option，例如：1/1CPT-1FO

	string reqPairCompCout{}; //需要crew的数量，多个使用英文分号(;)分割。例如：1*1+0；1*0+1
	set<string> reqPairCompCoutList{};

	string reqDutyCodeTypeComp{}; //Duty Code Type组成，多个使用英文加号(+)分割。例如：CommandingCaptain+CommandingFirstOfficer
	set<string> reqDutyCodeTypeCompList;

	string name{}; //名称

	string division;

	//string modifiedBy{};
	//time_t lastModified{};
};

//-----RosterProgramCourse--------
struct RosterProgramCourse {

	std::shared_ptr<TmProgramCourse> programCourse = nullptr; //学员TE计划课程对象programCourse；不可能为空。 若 programCourseInstructor不为空，则programCourse表示该教员某个学员；否则表示当前学员

	std::shared_ptr<TmProgramCourseInstructor> programCourseInstructor = nullptr;//教员IP/检查员CK等计划课程对象TmProgramCourseInstructor，可能为空。
};

////-----TmProgramCourseAndSegment--------
//struct TmProgramCourseAndSegment {
//	std::shared_ptr<RosterFlight> rf = nullptr;
//
//	std::shared_ptr<TmProgramCourse> programCourse = nullptr;
//
//	Duty* duty = nullptr;
//
//	Segment* segment = nullptr;
//};

//------------ CrewBaseTimezoneIndex -----------
//预处理crew base, 方便计算 utc时刻对应时区
//以每一时间段开始时刻为准
//因更换crew base导致切换时区时，可能导致切日期不为24h，如下demo 2-27 16:00 ~ 2-28 17:00切分天为25h
//demo
//   CREW BASE: TPE 2017-1-1, BKK 2017-3-1
//   getHourOffsetByUtc(2017-2-28 12:00) --> 8
//   getHourOffsetByUtc(2017-2-28 17:00) --> 7
class CrewDataContext;
class CrewBaseTimezoneIndex {
public:
	CrewBaseTimezoneIndex(string crewId, vector<std::shared_ptr<CREW_BASE>>& crewBaseList, CrewDataContext* dataCtx);
	int getOffsetMinutes(time_t utc);
	time_t getLocalDayStart(time_t utc);
	time_t getLocalDayEnd(time_t utc);
	void computeLocalDayListInUtc(time_t startUtc, time_t endUtc, vector<pair<time_t, time_t>>& resultDaysInUtc);//返回start到end每一日开始utc和最后一日结束utc
	const map<time_t, int>& getIndex();
private:
	const int NO_CREW_BASE_TIMEZONE = 99999;//作为 map::value，表示对应时刻没有crew_base定义
	map<time_t, int>::iterator findUtcOffsetMinutesPair(time_t utc);
	string crewId;
	map<time_t, int> utcToOffsetMinutesSequence; //每一时间段对应时区，如 TPE 2017-1-1 --> map<2016-12-31 16:00, 8>
	time_t noCrewBaseWarnDt = 0;
};

class CrewKpiAdjustTimeIndex {
public:
	CrewKpiAdjustTimeIndex(const std::vector<std::shared_ptr<CrewKpiAdjust>>& crewKpiAdjustList);

	const map<time_t, int>& getPerdiemIndex();

	const map<time_t, int>& getCreditIndex();
private:
	map<time_t, int> _perdiemAdjustIndex; //<LocalDay, PerdiemAdjustSum(Minutes)>
	map<time_t, int> _creditAdjustIndex; //<LocalDay, CreditAdjustSum(Minutes)>

	void makeIndex(const std::vector<std::shared_ptr<CrewKpiAdjust>>& crewKpiAdjustList);
};

constexpr int DAY_OFF_NA = -1;//当天不确定是否存在Day Off。-1：未知
constexpr int DAY_OFF_EXIST = 1;//当天存在Day Off。1：有
constexpr int DAY_OFF_NOT_EXIST = 0; //当天不存在Day Off。0：无

//存储Rule Phase的集合
class PhaseSet {
private:
	//待检查phase阶段
	ThreadLocal<set<long long>> _phaseIds;
	set<long long> _phaseIds_instance;
public:
	//获得所有匹配到阶段
	const set<long long>& getPhases() const;
	void setPhases(const set<long long>& phaseIds);
	void clearPhases();
	void appendPhase(const long long phaseId);
	void removePhase(const long long phaseId);
};

//------------ Crew_Manday_basic -----------
struct CREW_MANDAY_BASIC {


public:
	enum DIVISION {
		fd, cc_am
	};
	long long idScenario = 0;
	string idCrew; //VARCHAR2(12)
	int division = 0;  //fd, cc, am : pilot, cabinCrew, AirMarshal
	time_t crewDateUtc = 0; //DATE
	time_t dateLoc = 0; //20180322 ain
	double ft = 0;//number(4)
	double blh = 0; //NUMBER(4)
	double fdp = 0; //NUMBER(4)
	double dp = 0; //NUMBER(4)
	double	cust_dp = 0;
	bool LEAVE = 0; //NUMBER(1)
	int leaveDuration = 0;//LEAVE时长
	int DAY_OFF = DAY_OFF_NA; //NUMBER(1),是否有DO，取值：-1：未知，0：无，1：有
	bool STANDBY = 0; //NUMBER(1)
	bool IS_POSITION = 0; //是否有DHD
	int standbyDuration = 0; //STANDBY务时长
	bool GND = 0; //是否地面任务
	int groundDuration = 0;//地面任务时长
	double PER_DIEM = 0; //number(4)(实际时间)
	double LONG_PER_DIEM = 0; //长Perdiem(实际时间)

	double SCH_PER_DIEM = 0; //number(4)(计划时间)
	double SCH_LONG_PER_DIEM = 0; //长Perdiem(计划时间)

	double normal_wp = 0;
	double extend_wp = 0;

	//for BR
	bool CSB = 0;
	bool ASB = 0;
	bool HSB = 0;

	//客户特定定制数据1/2
	double       custData1 = 0;  
	double       custData2 = 0; 

	//op1714
	int IS_AL = 0;
	int al = 0; //Annual Leave Hours
	int QUARANTINE = 0;
	int quarantineDuration = 0;//QUARANTINE时长
	
	int HIGH_PLATEAU = 0;

	double credit = 0; //Credit Hours = Fly Credit Hours + Ground Credit Hours + AL Credit Hours(实际时间)
	double credit_pnc = 0;//组员DHD/PNC航段的CREDIT(EVAFD)(实际时间)
	double credit_sim = 0;//组员SIM类型航段的CREDIT(EVAFD)(实际时间)
	double credit_al = 0;//组员AL类型CREDIT(EVAFD)(实际时间)
	double credit_ol = 0;//组员OL类型的CREDIT(EVAFD)(实际时间)
	double credit_freighter = 0;//组员货机（B77X）航段的CREDIT(EVAFD)(实际时间)

	double sch_credit = 0; //Credit Hours = Fly Credit Hours + Ground Credit Hours + AL Credit Hours(计划时间)
	double sch_credit_pnc = 0;//组员DHD/PNC航段的CREDIT(EVAFD)(计划时间)
	double sch_credit_sim = 0;//组员SIM类型航段的CREDIT(EVAFD)(计划时间)
	double sch_credit_al = 0;//组员AL类型CREDIT(EVAFD)(计划时间)
	double sch_credit_ol = 0;//组员OL类型的CREDIT(EVAFD)(计划时间)
	double sch_credit_freighter = 0;//组员货机（B77X）航段的CREDIT(EVAFD)(计划时间)

	double workingHour = 0; //Working Hour(实际时间)
	double schWorkingHour = 0; //Working Hour(计划时间)

	double SBY_DP = 0;
	double DHD_DP = 0;

	int layover_day = 0; //完整日历日是Layover，则计入1，否则0。

	bool recalFleetLanding = false;//是否重新计算Fleet Landing/Taskoff

	std::map<string, int> operating_fleets{};//执行任务的机型(多个|分隔）Map<机型，机型数量>
	std::map<string, int> operating_airports{};//执行任务的机场(多个|分隔，不包括基地）,Map<机场，机场数量>

	std::map<string, int> fleetTakeoff{};//特定机型起飞次数，map<机型,起飞次数>
	std::map<string, int> fleetLanding{};//特定机型降落次数，map<机型,降落次数>
	std::map<string, int> nightFleetTakeoff{};//夜航特定机型起飞次数，map<机型,起飞次数>
	std::map<string, int> nightFleetLanding{};//夜航特定机型降落次数，map<机型,降落次数>

	std::string attributes{};
	double augBlh = 0;
	double intBlh = 0;
	int fltNum = 0;//当天航班数量

	double radiationDose = 0.0; //宇宙射线

	int layoverTimes = 0; //duty的Layover次数，不按天切分，计入layover的实际开始日期所在天。
    int layoverDuration = 0; //duty的Layover时长(分钟数)，不按天切分，计入layover的实际开始日期所在天。

    int crossTzDutyCount = 0; //跨时区的Duty数量。HX使用：计入跨6个时区并且有FDP值的Duty数量。不按天切分，仅计入Duty实际开始日期所在天

	int isDomesticDo = DAY_OFF_NA; //是否是DDO(国内DO)（HX港航使用）。取值： -1：未知（DAY_OFF_NA），0：否(DAY_OFF_NOT_EXIST)，1：是（DAY_OFF_EXIST）
	bool isFirstRecy6Offsetddo = false; //是否为跨6时区以上恢复的第一个DDO(与isDomesticDo配合使用）（HX港航使用），取值：false：否，true：是

	PhaseSet phase; //Manday所属Rule Phase



public:

	void addOperatingFleets(const std::map<string, int>& other);

	void addOperatingFleets(const std::pair<string, int>& otherPair);

	void minusOperatingFleets(const std::map<string, int>& other);

	void minusOperatingFleets(const std::pair<string, int>& otherPair);

	void addOperatingAirports(const std::map<string, int>& other);

	void addOperatingAirports(const std::pair<string, int>& otherPair);

	void minusOperatingAirports(const std::map<string, int>& other);

	void minusOperatingAirports(const std::pair<string, int>& otherPair);

	void minusAttributes(const std::string otherAttributes);

	void addFleetTakeoff(const std::map<string, int>& other);

	void addFleetTakeoff(const std::pair<string, int>& otherPair);

	void minusFleetTakeoff(const std::map<string, int>& other);

	void minusFleetTakeoff(const std::pair<string, int>& otherPair);

	void addFleetLanding(const std::map<string, int>& other);

	void addFleetLanding(const std::pair<string, int>& otherPair);

	void minusFleetLanding(const std::map<string, int>& other);

	void minusFleetLanding(const std::pair<string, int>& otherPair);

	void addNightFleetTakeoff(const std::map<string, int>& other);

	void addNightFleetTakeoff(const std::pair<string, int>& otherPair);

	void minusNightFleetTakeoff(const std::map<string, int>& other);

	void minusNightFleetTakeoff(const std::pair<string, int>& otherPair);

	void addNightFleetLanding(const std::map<string, int>& other);

	void addNightFleetLanding(const std::pair<string, int>& otherPair);

	void minusNightFleetLanding(const std::map<string, int>& other);

	void minusNightFleetLanding(const std::pair<string, int>& otherPair);

public:

	//检查是否统计值全部为0
	virtual bool isEmpty();
	//清零
	virtual void reset(const bool isAll = false);
	//从目标对象拷贝数据
	virtual void copyFrom(CREW_MANDAY_BASIC * that);
	//addFrom:在this增加that各字段数值
	virtual void addFrom(CREW_MANDAY_BASIC * that, bool isHalf);
	//minusFrom:从当前this减去that各字段数值
	virtual void minusFrom(CREW_MANDAY_BASIC * that, bool isHalf);
	CREW_MANDAY_BASIC();
	CREW_MANDAY_BASIC(string crewId, time_t utc);
	
};
//------------ Crew_Manday_Fd ------------
struct CREW_MANDAY_FD : public CREW_MANDAY_BASIC {
	CREW_MANDAY_FD();//

	int       augumentFt = 0;
	int       doubleFt = 0;
	//int       augumentBlh = 0;
	int       doubleBlh = 0;
	int       nightDp = 0;
	int       travel = 0;
	//int       credit = 0;
	int       actTakeOffs = 0;
	int       actLandings = 0;
	int       pubBlh = 0;
	int       pubAugBlh = 0;
	int       pubDobBlh = 0;
	int       pubFdp = 0;
	int       pubDp = 0;
	int       pubNightDp = 0;
	int       pubTravel = 0;
	int       pubCredit = 0;
	string    idUser;
	time_t    tmst = 0;

	int       updowns = 0;     //OP#1951
	int       cat2Updowns = 0; //OP#1951
	int       expBlh = 0;      //OP#1951
	int		  takeoff = 0;
	int		  landing = 0;
	int       fatigue = 0;

public:
	//检查是否统计值全部为0
	bool isEmpty() override;
	//清零
	void reset(const bool isAll = false) override;
	//从目标对象拷贝数据
	void copyFrom(CREW_MANDAY_BASIC* that) override;
	//addFrom:在this增加that各字段数值
	void addFrom(CREW_MANDAY_BASIC* that, bool isHalf) override;
	//minusFrom:从当前this减去that各字段数值
	void minusFrom(CREW_MANDAY_BASIC* that, bool isHalf) override;

};

//------------ Crew_Manday_cc_am
struct CREW_MANDAY_CC_AM : public CREW_MANDAY_BASIC{
	CREW_MANDAY_CC_AM();//

	int NIGHT_DP = 0; //NUMBER(4)
	int TRAVEL = 0; //NUMBER(4)
	//int CREDIT = 0; //NUMBER(4)
	int FATIGUE = 0; //NUMBER(4)
	//int PUB_BLH = 0; //NUMBER(4)
	//int PUB_FDP = 0; //NUMBER(4)
	//int PUB_DP = 0; //NUMBER(4)
	//int PUB_NIGHT_DP = 0; //NUMBER(4)
	//int PUB_TRAVEL = 0; //NUMBER(4)
	//int PUB_CREDIT = 0; //NUMBER(4)
	//int PUB_FATIGUE = 0; //NUMBER(4)
	//int PUB_LEAVE = 0; //NUMBER(1)
	//int PUB_DAY_OFF = 0; //NUMBER(1)
	//int PUB_STANDBY = 0; //NUMBER(1)
	string idUser; //VARCHAR2(30)
	time_t tmst = 0; //DAT

	//检查是否统计值全部为0
	bool isEmpty() override;
	//清零
	void reset(const bool isAll = false) override;
	//从目标对象拷贝数据
	void copyFrom(CREW_MANDAY_BASIC* that) override;
	//addFrom:在this增加that各字段数值
	void addFrom(CREW_MANDAY_BASIC* that, bool isHalf) override;
	//minusFrom:从当前this减去that各字段数值
	void minusFrom(CREW_MANDAY_BASIC* that, bool isHalf) override;

};

struct CREW_FLY_TOGETHER {
	long long id = 0;
	string	  crewIdA;
	string	  crewIdB;
	string	  flyTogetherIndicator;
	string	  reason;
	time_t	  effectiveDate = -1;
	time_t	  expiryDate = -1;
	string	  restrictionType;
	vector<string> restrictionTypeList;

	// todo: parse the below fields
	string strAirports;
	std::vector<std::string> airports;

	string strAttributes;
	std::vector<std::string> attributes;
};

struct CREW_FLY_PREFERENCE {
	long long id = 0;
	string crewId;
	long prefType = -1;
	long priority = -1;
	string dir;//国内和国际类型，取值：Domestic(D),International(I) or Regional(R)
	string soft;
	string flightNums;
	string stations;
	string attributes;
	time_t effectiveDate = -1;
	time_t expiryDate = -1;
};

//------------ CREW_ENTITLEMENT -------------
struct CREW_ENTITLEMENT {
	string crewId;
	string airline;
	string type;
	int year = 0;
	double entitlement = 0;
	double used = 0;
	time_t effDt = 0;
	time_t expDt = 0;
	int carryOver = 0;
	time_t carrtOverDt = 0;
	bool isSameItem(CREW_ENTITLEMENT* that) {
		if (this->crewId != that->crewId) return false;
		if (this->type != that->type) return false;
		if (this->year != that->year) return false;
		if (this->effDt != that->effDt) return false;
		return true;
	}
};

struct CREW_FIRST_DUTY_INFO {
	string crewId;
	time_t lastFirstDutyDate;
	int totalBlh = 0;
	int totalFltNum = 0;
	map<string, int> airports{};
	time_t inexperiencedEndDate = 0;
};

//------------ CREW_PREFERENCE
struct CREW_PREFERENCE {
	long long id = 0;
	string idCrew; //VARCHAR2(12)
	time_t strDtloc = 0;
	time_t endDtLoc = 0;
	string prefType;
	string pref;
	long long prefId = 0;
	int point = 0;
	string assignment;  //assignment group
	long long rosterId = 0;
	long long rosterIdTrade = 0;
	long long pairingId = 0;
	string label;
	string attribute;
	int priority = 0;
	string status;
	string denialReason;
	string denialComment;
	string createBy;
	time_t createDt = 0;
	time_t expiryDt = -1;
	time_t lastReviewDt = -1;
	string remark;
	string idUser;
	time_t tmst = 0;
	vector<string> relatedCrewIds;
	long long transactionId = 0;
	string reason;

	int outstanding = 0;
	int leavedays = 0;
	int granted = 0;
	int workdays = 0;
	//mantis#3342, 增加字段
	int ver = 0;
	string qualifier;   //assignment
	int replaceOverlap = 0;
	bool isPublished = false;
	time_t publishedDt = 0;
	int changeStatus = 0;
	int sort = -1;
	string actingRank;

	bool isSame(CREW_PREFERENCE* o);
};

//------------ CREW_PROFILE
struct CREW_PROFILE {
	long long id = 0;
	string crewId;
	string profile;
	string type;
	time_t effDt = 0;
	time_t expDt = 0;
};

struct CREW_RERRP {
	string crewId;
	time_t startTimeLoc = 0;
	time_t endTimeLoc = 0;
};
//------------- BidRequirementDetail -------------
class BidRequirementDetail {
public:
    long long int bidRequirementId{0};
    std::string infoValue;
    std::string infoType;
};

//------------- BidRequirement -------------
class BidRequirement {
public:
    enum class Type : char {
        AL,
        BDO,
        TimeOff,
        LO,
        RDO,
		FLT,
        Route,
        Turnaround,
        Layover,
        Attribute,
        Unknown
    };
    const static std::unordered_map<std::string, Type> TypeMap;
    long long int id{0};
    long long int bidId{0};
    Type type{Type::Unknown};
    long long int startTimeUtc{0};
    long long int endTimeUtc{0};
    bool isPreAssignmentCount{true};
	bool isNeedAssignByCondition{false};
	bool isNeedCheckLegality{true};
    std::vector<std::shared_ptr<BidRequirementDetail>> details;
};

//------------- Bid -------------
class Bid {
public:
    enum class SatisfactionCriteria : char {
        Any,
        All,
        Percentage
    };
    const static std::unordered_map<std::string, SatisfactionCriteria> SatisfactionCriteriaMap;
    long long int id{0};
    std::string crewId;
    double points{0.1};
    SatisfactionCriteria satisfactionCriteria{SatisfactionCriteria::Any};
    int satisfactionContribution{1};
    std::vector<std::shared_ptr<BidRequirement>> requirements;
};
//------------- BiddingSequence -------------
class BiddingSequence {
public:
    long long int groupId{0};
    long long int bidId{0};
    long long int satisfactionSequence{0};
    std::shared_ptr<Bid> bidItem;
};

//------------- BiddingSequenceGroup -------------
class BiddingSequenceGroup {
public:
    enum class Type : char {
        Personal,
        Collective
    };
    const static std::unordered_map<std::string, Type> TypeMap;
    long long int id{0};
    bool forceSequence = false;
    Type type{Type::Collective};
	long long bidSettingId{0};
	int maxApprovalTime{INT_MAX};
    std::vector<std::shared_ptr<BiddingSequence>> biddingSequences;
};
//------------- BiddingResultDetail -------------
class BiddingResultDetail {
public:
    long long int bidId{0};
    long long int relatedRosterId{0};
    long long int relatedRosterGroundId{0};
};
//------------- BiddingResult -------------
class BiddingResult {
public:
    long long int bidId{0};
    bool satisfied{false};
    std::vector<std::shared_ptr<BiddingResultDetail>> details;
};
//利用 Factory模式创建 manday对象
//以不同divison创建的 factory将创建不同的 manday对象 (fd或cc_am)
//class CREW_MANDAY_FACTORY {
//public:
//	CREW_MANDAY_FACTORY(int division) : _division(division) { }
//	std::shared_ptr<CREW_MANDAY_BASIC> createMandayInstance() {
//		if (_division == CREW_MANDAY_BASIC::fd) {
//			return std::shared_ptr<CREW_MANDAY_FD>(new CREW_MANDAY_FD());
//		}
//		else {
//			return std::shared_ptr<CREW_MANDAY_CC_AM>(new CREW_MANDAY_CC_AM());
//		}
//	}
//private:
//	int _division;
//};
//------------ CREW --------------
class CREW {
public:
	string    idCrew;
	vector<std::shared_ptr<CREW_QUALIFICATION>> qualificationListInDb;//数据库原始资质数据，未按有效期合并
	vector<std::shared_ptr<CREW_QUALIFICATION>> qualificationList;

	//根据法规设置过滤需要的资质列表，避免RO法规超大循环
	unordered_map<string, std::shared_ptr<CREW_QUALIFICATION>> qualListFiltedByRules;

	vector<std::shared_ptr<CREW_FLEET>>           fleetList;
	vector<std::shared_ptr<CREW_RANK>>            rankList;
	vector<std::shared_ptr<CREW_COMPANY_RANK>>    companyRankList;
	vector<std::shared_ptr<CREW_BASE>>            baseList;
	vector<std::shared_ptr<CREW_MANDAY_FD>>       mandayFdList;
	vector<std::shared_ptr<CREW_MANDAY_FD>>       publishedMandayFdList;
	vector<std::shared_ptr<CREW_FLY_TOGETHER>>    crewFlyTogetherList;
	vector<std::shared_ptr<CREW_FLY_PREFERENCE>>  crewFlyPreferenceList;
	vector<std::shared_ptr<CREW_MANDAY_CC_AM>>    mandayCcAmList;
	vector<std::shared_ptr<CREW_MANDAY_CC_AM>>    publishedMandayCcAmList;
	vector<std::shared_ptr<CREW_PREFERENCE>>      preferenceList;
    vector<std::shared_ptr<CREW_REQUEST_DETAIL>>  crewRequestDetailList;
    vector<std::shared_ptr<CREW_REQUEST_RECORD_DETAIL>>  crewRequestRecordDetailList;
	vector<std::shared_ptr<CREW_STATUS>>          statusList;
	vector<std::shared_ptr<CREW_TEAM>>            teamList;
	vector<std::shared_ptr<CREW_ENTITLEMENT>>     entitlements;
	vector<std::shared_ptr<CREW_GUARANTEE_HOUR>>  guaranteeHourList;
	map<int, double>                              avgAnnGuaranteeHourMap; //guarantee hours 年度每日平均值, map<year,avgAnnGuaranteeHour(分钟)>
	vector<std::shared_ptr<CREW_PROFILE>>         profiles;
	vector<std::shared_ptr<ROSTER>>               rosterList;
	vector<std::shared_ptr<CREW_RERRP>>			rerrpList;
	vector<std::shared_ptr<GuaranteeFlyHours>>    guaranteeFlyHoursList;
	std::shared_ptr<IndexCrewBaseRankFleet>       index;
	std::shared_ptr<CrewBaseTimezoneIndex>        crewBaseTimezoneOffsetIndex;
	vector<std::shared_ptr<CrewKpiAdjust>>		  crewKpiAdjustList;
	std::shared_ptr<CrewKpiAdjustTimeIndex>		  crewKpiAdjustTimeIndex;
    std::vector<std::shared_ptr<Bid>>             crewBidItems;
	std::shared_ptr<CREW_FIRST_DUTY_INFO>		  crewFirstDutyInfo;
	string    airline;
	string    firstName;
	string    midName;
	string    lastName;
	string    preferredName;
	string    alias;
	string    initials;
	string    title;
	string    gender;
	string    division;
	time_t      emplUtc = -1;
	string    emplNum;
	time_t      permUtc = -1;
	time_t      retireUtc = -1;
	time_t      termUtc = -1;
	string    emplStatus;
	string    seniorityCode;
	int       seniorityNum = 0;
	time_t      latestStrUtc = -1;
	//time_t      birthdayUtc;
	tm        birthdayTm;
	string    birthCity;
	string    birthState;
	string    birthCountry;
	string    nationality;
	string    natinalIdentification;
	string    spouseIdcrew;
	string    prevIdcrew;
	string    passportFirstName;
	string    passportMidName;
	string    passportLastName;
	string    remark;
	string    idUser;
	time_t      tmst = 0;
	int       status = 0;
	int		  serviceDay = 0;
	double	  seniority = 0.0;
	string departmentCode;
	time_t lastPublishDate = 0;//crew最后（最远一次）的计划发布日（主基地本地时区）
	//SGQ
	bool _isLegal = true;
	vector<string> _vilation_messages;
	
	CREW();
	CREW(const CREW& obj);
	string getPrimeBase();
	string getCrewBase(time_t timeUtc);
	double getAgeByTime(time_t timeUtc);

	std::shared_ptr<CREW_RANK> getActiveRankInTimes(time_t start, time_t end, string fleet = "");

	/*
	* 通过本地日期获得承包小时对象列表
	* @param localDay 本地时间，机组人员所属主基地的时区
	*/
	vector<std::shared_ptr<GuaranteeFlyHours>> getGuaranteeFlyingHours(const time_t localDay) const;

	/*
	* 通过本地日期获得承包小时
	* @param localDay 本地时间，机组人员所属主基地的时区
	*/
	int getGuaranteeFlyingHour(const time_t localDay) const;

	/*
	* 通过本地日期获得当前日期所在月的保证工作的最低小时数(单位：分钟)
	* @param localDay 本地时间，机组人员所属主基地的时区
	*/
	int getGuaranteeHour(const time_t localDay) const;

	void makeAvgAnnGuaranteeHour();

	void makeRosterValidity();

	void makeRosterValidity(std::shared_ptr<ROSTER>& roster);

	void clear();
};


//-----------------CrewLastPublishDate(虚拟表)------------------
struct CrewLastPublishDate {
	string    crewId;
	time_t    lastPublishDate = 0;//crew最后（最远一次）的计划发布日（主基地本地时区）
};
//------------- Briefing ------------
struct Briefing {
	long long id = 0;
	string airline ;
	string airport ;
	string dir ;
	int strTm = 0; //minutes from 00:00, range 0~1439
	int endTm = 0; //minutes from 00:00, range 0~1439
	int flyBrief = 0;
	int flyDebrief = 0;
	int dhdBrief = 0;
	int dhdDebrief = 0;
	int trainBrief = 0;
	int trainDebrief = 0;
	int busBrief = 0;
	int busDebrief = 0;
	int otherBrief = 0;
	int otherDebrief = 0;
	int pickup = 0;
	int dropoff = 0;
};
//------------- Airport -------------
struct DBAirport {
	char	  plateauType[2] = { 0 };
	char      airport[4] = { 0 };
	char      airportName[51] = { 0 };
	char      airportNativeName[81] = { 0 };
	int       utcOffsetMinutes;
	char      zoneId[50] = { 0 };
	char      dstGrp[5] = { 0 };
	char      isInternalBase[2] = { 0 };
	char      isCrossContinental[2] = { 0 };
	char      airportICAO[5] = { 0 };      //4字码
	char      airportABBR[31] = { 0 };
	char      cityName[51] = { 0 };
	char      cityNativeName[81] = { 0 };
	char      city[4] = { 0 };
	char      country[3] = { 0 };
	char      dir[3] = { 0 };
	string    category;
	string    rnp;
	string    cats;
	string    icRoute;//洲际航线(Intercontinental route)的代码
	double    latitude = 0; //纬度
	double    longitude = 0; //经度
	DBAirport();
};
struct DBAircraft{
	string airline;
	string acReg;
	string acType;
	string acTypeSon;
	string crewAcType;
	string cats;
	string rnp;
	int dow = 0;
	int dowL = 0;
	int restFacility = 0;//飞行休息设施， 0 - no rest facility,1 - adequate rest facility,2 - suitable rest facility, 3 - luxury rest facility
	int ccRestFacility = 0;//客舱休息设施
	int fdRestFacCnt = 0;//飞行休息设施数量
	int ccRestFacCnt = 0;//客舱休息设施数量
	float doi = 0.0;
	float doiL = 0.0;
	string flyDevice;
	int maxDepartWeight = 0;
	int maxLandfallWeight = 0;
	int maxNoOilWeight = 0;
	time_t startDate = -1;
	time_t endDate = -1;
	int seats = 0;
	bool isExistRest = true;
	bool isCat2 = false;
};
struct DBPortQualReqmnts {
	char      airline[3] = { 0 };
	char      division[2] = { 0 };
	char      crewGroup[10] = { 0 };
	char      fltNum[6] = { 0 };
	char      airport[4] = { 0 };
	char      fleet[5] = { 0 };
	char      rank[20] = { 0 };
	char      qual[21] = { 0 };//20190123 ain, mantis#4884, PortQualReqmnt.qual长度限制 5->21
	time_t      effLocal = 0;
	time_t      expLocal = 0;
	char      startTime[6] = { 0 };
	char      endTime[6] = { 0 };
	char      inOutInd[2] = { 0 };
	char      exceptionCode[51] = { 0 };//20190511 ain
	int		  level = 0;
	char	  segType[6] = { 0 };
	bool	  isRestricted = false;
};

//------------ Acting_Rank -------------
//描述每个rank能够downrank到哪些其他rank执行任务
struct DBRankActing {
	long long tid = 0;
	string    airline;
	string    activeRank;
	string    actingRank;
	string    qual;
	string    iduser;
	time_t      tmst = 0;
};


//route_actual_rest
struct RouteActualRest{
	long long id = 0;
	int restTime = 0;
	time_t schDepDtLoc = 0, schArvDtLoc = 0;
	string airline, fltNum, depArp, arvArp, crewId;
	bool isSameFltCrew(RouteActualRest* that) {
		if (crewId != that->crewId) return false;
		if (fltNum != that->fltNum) return false;
		if (depArp != that->depArp) return false;
		if (schDepDtLoc != that->schDepDtLoc) return false;
		return true;
	}
};
struct RouteRadiationConfig {
	long long id = 0;
	string filiale;
	string fleet;
	string depArp;
	string arvArp;
	double radiationDose = 0.0;
	time_t effDt;
	time_t expDt;
};
struct RosterPeriod {
	long long id = 0;
	string year;
	string name;
	string roster_period;
	time_t rp_start = 0;
	time_t rp_end = 0;
	time_t roster_publication_date = 0;
	time_t paid_date = 0;
};
//ROUTE
struct Route {
	long long id = 0;
	long long routeId = 0;
	string airline;
	string fltNum;
	string depArp;
	string arvArp;
	string segType;
	time_t flt_dt_start = 0;
	time_t flt_dt_end = 0;
};
//struct RosterPeriod {
//	long long id = 0;
//	string year;
//	string name;
//	string roster_period;
//	time_t rp_start;
//	time_t rp_end;
//	time_t roster_publication_date;
//	time_t paid_date;
//};
//RankCombinationCriteria
struct RankCombinationCriteria {
	long long id = 0;
	string airline;
	string division;
	string filiale;
	int pri = 0;
	string fleets;
	long long routeId = 0;
	int crewNum = 0;
	string assignment; //支持竖线分割多组合, eg TSB|XSB|HSB
	vector<string> assignmentVec;//初始化取值按 split(assignment)
	time_t effDt = 0;
	time_t expDt = 0;
	string crewNumRanks;

	//3.0新增字段，作爲配比篩選
	long rptStart = 0;
	long rptEnd = 0;
	long landingLow = 0;
	long landingUpper = 0;
	long fdpLow = 0;
	long fdpUpper = 99999999;
	long blhLow = 0;
	long blhUpper = 99999999;
	string courseTypeStr;
	vector<string> courseTypes;
	string courseCodeStr;
	vector<string> courseCodes;
	map<string, bool> crewNumRanksMap; //预处理：方便crewNumRanks匹配逻辑代码编写
};
struct RankCombination {
	long long id = 0;
	long long rankCombCriteriaId = 0;
	int options = 0;
	int seqOrder = 0;
	string rank;
	string positions;
	//ONLY FOR RULE, INDICATE IF IT IS USED BY OTHER CREW
	bool isUsed = false;
	vector<string> qualifiedCrews;
};

struct CompositionLoad {
	long long id = 0;
	string filiale;
	string division;
	string fltNum;
	vector<string> fltNumVec;
	string fleet;
	vector<string> fleetVec;
	string subFleet;
	vector<string> subFleetVec;
	string flightFlag;
	vector<string> flightFlagVec;
	string fltType;
	vector<string> fltTypeVec;
	string segType;
	vector<string> segTypeVec;
	long long routeId = 0;
	long long compId = 0;
	string flightAssignment;
	vector<string> flightAssignmentVec;
	string serviceType;
	vector<string> serviceTypeVec;
	string paxNum;
	vector<string> paxNumVec;
	int restFacility = 0;
	long long departureTimeStart = 0;
	long long departureTimeEnd = 0;
	long long arrivalTimeStart = 0;
	long long arrivalTimeEnd = 0;
	long long optionId = 0;
	long long blhLow = 0;
	long long blhUpper = 0;
};
//承包飞行小时数配置
struct GuaranteeFlyHours {
	long long id = 0;
	string base=""; //基地，以|分隔
	vector<string> bases;//基地列表，若为空表示该条件无效
	string rank;//级别，以|分隔
	vector<string> ranks;//级别列表，若为空表示该条件无效
	string fleet;//机型，以|分隔
	vector<string> fleets;//机型列表，若为空表示该条件无效
	string team = ""; //组别(机组人员的分组)ID，以|分隔
	vector<long long> teams; //组别(机组人员的分组)ID列表，若为空表示该条件无效
	int guaranteeFlyingHour = 0;//承包飞时
	time_t effDt = 0;//生效日期,机组人员的本地时间
	string frequency = ""; //计算周期, 取值：Calendar Month 或者 Roster Period
	time_t expDt = 0;//失效日期, 机组人员的本地时间
	string modifiedBy;
	time_t lastModified = 0; //修改时间 UTC时间
};

//PerDiem(津贴)
struct PerDiem {
	int schPerDiemInSec = 0;                //计划pairing per-diem(单位：秒)
	int schLongPerDiemInSec = 0;            //计划pairing long per-diem的时长(单位：秒)
	int schFirstMonthPerDiemInSec = 0;      //计划split pairing first month long per-diem的时长(单位：秒)
	int schFirstMonthLongPerDiemInSec = 0;  //计划split pairing first month long per-diem的时长(单位：秒)

	int actPerDiemInSec = 0;                //实际pairing per-diem(单位：秒)
	int actLongPerDiemInSec = 0;            //实际pairing long per-diem的时长(单位：秒)
	int actFirstMonthPerDiemInSec = 0;      //实际split pairing first month long per-diem的时长(单位：秒)
	int actFirstMonthLongPerDiemInSec = 0;  //实际split pairing first month long per-diem的时长(单位：秒)

	PerDiem() {

	}

	PerDiem(const string& timeType, const int perDiemInSec, const int longPerDiemInSec, const int firstMonthPerDiemInSec, const int firstMonthLongPerDiemInSec) {
		this->setPerDiem(timeType, perDiemInSec, longPerDiemInSec, firstMonthPerDiemInSec, firstMonthLongPerDiemInSec);
	}

	inline void setPerDiem(const string& timeType, const int perDiemInSec, const int longPerDiemInSec, const int firstMonthPerDiemInSec, const int firstMonthLongPerDiemInSec) {
		if (timeType == "SCH") {
			schPerDiemInSec = perDiemInSec;
			schLongPerDiemInSec = longPerDiemInSec;
			schFirstMonthPerDiemInSec = firstMonthPerDiemInSec;
			schFirstMonthLongPerDiemInSec = firstMonthLongPerDiemInSec;
		}
		else {
			actPerDiemInSec = perDiemInSec;
			actLongPerDiemInSec = longPerDiemInSec;
			actFirstMonthPerDiemInSec = firstMonthPerDiemInSec;
			actFirstMonthLongPerDiemInSec = firstMonthLongPerDiemInSec;
		}
	}

	inline int getPerDiemInSec(const string& timeType) const {
		if (timeType == "SCH") {
			return schPerDiemInSec;
		}
		else {
			return actPerDiemInSec;
		}
	}

	inline void setPerDiemInSec(const int perDiemInSec, const string& timeType) {
		if (timeType == "SCH") {
			schPerDiemInSec = perDiemInSec;
		}
		else {
			actPerDiemInSec = perDiemInSec;
		}
	}

	inline int getLongPerDiemInSec(const string& timeType) const {
		if (timeType == "SCH") {
			return schLongPerDiemInSec;
		}
		else {
			return actLongPerDiemInSec;
		}
	}

	inline void setLongPerDiemInSec(const int longPerDiemInSec, const string& timeType) {
		if (timeType == "SCH") {
			schLongPerDiemInSec = longPerDiemInSec;
		}
		else {
			actLongPerDiemInSec = longPerDiemInSec;
		}
	}

	inline int getFirstMonthPerDiemInSec(const string& timeType) const {
		if (timeType == "SCH") {
			return schFirstMonthPerDiemInSec;
		}
		else {
			return actFirstMonthPerDiemInSec;
		}
	}

	inline void setFirstMonthPerDiemInSec(const int firstMonthPerDiemInSec, const string& timeType) {
		if (timeType == "SCH") {
			schFirstMonthPerDiemInSec = firstMonthPerDiemInSec;
		}
		else {
			actFirstMonthPerDiemInSec = firstMonthPerDiemInSec;
		}
	}

	inline int getFirstMonthLongPerDiemInSec(const string& timeType) const {
		if (timeType == "SCH") {
			return schFirstMonthLongPerDiemInSec;
		}
		else {
			return actFirstMonthLongPerDiemInSec;
		}
	}

	inline void setFirstMonthLongPerDiemInSec(const int firstMonthLongPerDiemInSec, const string& timeType) {
		if (timeType == "SCH") {
			schFirstMonthLongPerDiemInSec = firstMonthLongPerDiemInSec;
		}
		else {
			actFirstMonthLongPerDiemInSec = firstMonthLongPerDiemInSec;
		}
	}


};

//按manday每天统计的PerDiem(津贴)
struct MandayPerDiem {
	double schPerDiemInMins = 0;                //某天计划的PerDiem(分钟数)
	double schLongPerDiemInMins = 0;            //某天计划的Long PerDiem(分钟数)

	double actPerDiemInMins = 0;                //某天实际的PerDiem(分钟数)
	double actLongPerDiemInMins = 0;            //某天实际的Long PerDiem(分钟数)

	inline double getPerDiemInMins(const string& timeType) const {
		if (timeType == "SCH") {
			return schPerDiemInMins;
		}
		else {
			return actPerDiemInMins;
		}
	}

	inline void setPerDiemInMins(const double perDiemInMins, const string& timeType) {
		if (timeType == "SCH") {
			schPerDiemInMins = perDiemInMins;
		}
		else {
			actPerDiemInMins = perDiemInMins;
		}
	}

	inline double getLongPerDiemInMins(const string& timeType) const {
		if (timeType == "SCH") {
			return schLongPerDiemInMins;
		}
		else {
			return actLongPerDiemInMins;
		}
	}

	inline void setLongPerDiemInMins(const double longPerDiemInMins, const string& timeType) {
		if (timeType == "SCH") {
			schLongPerDiemInMins = longPerDiemInMins;
		}
		else {
			actLongPerDiemInMins = longPerDiemInMins;
		}
	}
};


//Credit Hours
struct CreditHour {
	long long pairingId = 0;
	long long segmentId = 0;
	long long flightId = 0;
	long long rosterId = 0;

	double schCreditInMins = 0;              //计划Credit(分钟数)
	double schFirstMonthCreditInMins = 0;    //计划拆分首月的Credit(分钟数)

	double actCreditInMins = 0;              //实际Credit(分钟数)
	double actFirstMonthCreditInMins = 0;    //实际拆分首月的Credit(分钟数)
};

//按manday每天统计的Credit
struct MandayCreditHour {
	double schCreditInMins = 0;                      //某天计划的Credit(分钟数)
	map<string, double>  schAssCreditInMinsMap;      //某天计划的Assignment的credit时长合计(分钟数),map<assignment, 当天credit时长合计(分钟数)>

	double actCreditInMins = 0;                      //某天实际的Credit(分钟数)
	map<string, double>  actAssCreditInMinsMap;      //某天实际的Assignment的credit时长合计(分钟数),map<assignment, 当天credit时长合计(分钟数)>
};

//------------ CA CABIN STUDENTS INFO FOR PRELOCK TEACHER--------- ADD BY CJ
struct StudentsInfoForPreLockTeacher
{
	string crewTeam;//AIRBUS|BOEING
	string teachingStartTime;
	string teamNames;//CT1|CT2|....
	string fleets;
	int numStudents = 0;
};
//------------ CA CABIN STUDENTS INFO FOR PRELOCK TEACHER--------- ADD BY CJ
struct HistoryTeachingHoursForCACCInitialTeaching
{
	string teacherId;
	double teachingHours = 0.0;
	int teachingNumSegs = 0;
	string year;
	string month;
};
//------------ RULE CACHE -------------
//预处理rule param基类，用于多态
class ruleParams {

};

//预处理8107
class rule8107 : public ruleParams {
public:
	string assignmentA = "*";
	string assignmentB = "*";
	string qualifierA = "*";
	string qualifierB = "*";
	string groupGapRange = "*";
	int groupGapRangeLowerMinutes = -1;
	int groupGapRangeUpperMinutes = -1;
	bool isMergeFdp = false;
	string mergeFdpLogic = "*";
	bool isMergeDp = false;
	string mergeDpLogic = "*";
};

//预处理8002
class rule8002 : public ruleParams {
public:
	string strMax;
	string strPrdDesc;
	string strProrated;
	string strLastDay = "0";
	string strMin = "00:00";
	string strBase;
	string strRank;
	string strFleet;
	string strPeriod;
	string strType;
	string strTeams = "*";
	int iMin = 0;
	int iMax = 999999;

	string intOperationBLH = "*"; //国际飞行小时范围(左闭右开，即大于等于并且小于)，格式:HH:MM-HH:MM
	int intOperationBLHMinutesLower = 0;
	int intOperationBLHMinutesUpper = 0;

	string augOperationBLH = "*"; //加强组飞行小时范围(左闭右开，即大于等于并且小于)，格式:HH:MM-HH:MM
	int augOperationBLHMinutesLower = 0;
	int augOperationBLHMinutesUpper = 0;

	string dutyAloftTime = "*"; //Duty Aloft时间范围(左闭右开，即大于等于并且小于)，格式:HH:MM-HH:MM
	int dutyAloftTimeMinutesLower = 0;
	int dutyAloftTimeMinutesUpper = 0;

    shared_ptr<bool> hasSBYorFLY{ nullptr };//检查周期内是否有SBY或FLY任务，过滤条件。支持*，取值：Y-有SBY或FLY任务,  N-没有SBY和FLY任务。

	string reductionPerDuty = "*";//每个Duty扣减值(分钟数)，格式：HH:mm，支持*表示忽略。HX使用：n个Duty满足跨6小时时区（来自manday.crossTzDutyCount）条件，则扣减n次，即：扣减值= n*"Reduction per Duty"。
	int reductionMinutesPerDuty = 0;
};
//预处理8003
class rule8003item {
public:
	string airline, activeRank, actingRank, qual, assignmentGroupStr;
	string qualFleetsStr = "*";
	string qualFleetsGroupStr = "*";
	string crewFleetsStr = "*";
	vector<string> assignmentGroups;
	vector<string> activeRanks;
	vector<string> actingRanks;
	vector<string> quals;
	vector<string> qualFleets;
	vector<string> qualFleetsGroups;
	vector<string> crewFleets;
};
class rule8003 : public ruleParams {
public:
	vector<rule8003item> list;
};
//预处理8004
class rule8004 : public ruleParams {
public:
	string strBase, strRank, strFleet, strType, strUnit;
	bool isEnable = false;
	int iGracePeriod = 0;
	int lGrace = 0;
	string assignments = "*";
};

//预处理8005
class rule8005 : public ruleParams {
public:
	multimap<string, string> noWarningAirportPairs;//不警告前后base连续问题的组合，如 <TPE,TSA>
	vector<string> excludeAssignmentGroups;
	vector<string> excludeAssignmentQuals;
};
//预处理8014
class rule8014 : public ruleParams {
public:
	string rRank;
	string rFleet;
	string rDutyGroup;
	string rQual;
	string rQualFleets = "*";
	string rQualFleetsGroup = "*";
	string rCrewFleets = "*";
	string rAlertBuffer;
	string rAlertUnit;
	string rActiveRanks;
	string rTailNums="*";
	string rServiceType = "*";
	string rExcludeRoles = "*";
	string rExcludeSubRoles = "*";
	int iBuffer = 0;
	vector<string> qualifications;
	vector<string> fleets;
	vector<string> assignmentGroups;
	vector<string> actingRanks;
	vector<string> qualFleets;
	vector<string> qualFleetsGroups;
	vector<string> crewFleets;
	vector<string> tailNumbers;
	vector<string> segTypes;
	vector<string> excludeRoles;
	vector<string> excludeSubRoles;
};
//2003
class rule2003 : public ruleParams {
public:
	string base;
	int maxPgLength = 0;
	int maxDutiesinPG = 0;
	string allowReturnBaseinDuty;
	string maxBlh;    //hh:mm
	string strMaxDays;//calendars
	vector<string> allowableLayoverStation;
	vector<string> fleets;
	vector<string> fleetGroups;
	//string strAllowableLayoverStation;
};
//2004
class rule2004 : public ruleParams {
public:
	string maxNrFlySegsInDuty;
	string maxNrNonoperateLegsInDuty;
	string maxNrAircraftChangeInDuty;
	string maxNrConsecutiveDhd;
	string maxNrDHDInDuty;
	string isDhdAllowedInMiddleDuty;
//	string dutyEndAfterMidNightThredhold;
	string isDutySegmentsInSameCalendarDay;
//	string isDeadheadAllowBeforeAndAfterFourDayPairing;
	string maxNrGRDCommuteInDuty;
	string isDutyBelongToDifferentDayChecked;
//	string discountFactorForDhdBlkTime;
	string maxNrAircraftchangsAndLTInDuty;
	string isDHDmustBetweenBaseAndLOStation;
	string totalSegsInDuty;
	string maxFlightBLHAllowDHD;
	string isInternationalDHDallowed;
	string overNightFlyThredhold;
	string maxDutyDP;
	string maxFlyTimeInDuty;
	string pureDeadheadDutyAllowed = "Y";
	string maxFdpWithAircraftChange;
};
//2109
class rule2109 : public ruleParams {
public:
	string maxTimesPerDuty;
	string maxTimesPerPairing;
	string allowedStartTime;
	string allowedEndTime;
	string inbound;
	string outbound;
	int maxRestTimeMins = 0;
	int minRestTimeMins = 0;
};
// 6001
class rule6001 :public ruleParams {
public:
	string RDO_leadIn;
	string RDO_mian;
	string RDO_leadOut;
	string minLength;
	bool useBlankDay = false;
	bool useDutyRest = false;
	string preferred;
	string notPreferred;
	bool utilizePostDutyRest = false;
	bool countBlankDay = false;
};
//2007
class rule2007 :public ruleParams{
public:
	string composition;
	string withBunk;
	int maxFdp = -1;//min
	int maxExtension = -1;//min
};
//3007
class rule3007 :public ruleParams{
public:
	string composition;
	string restFacility;
	int landingLower = 0;
	int landingsUpper = 0;
	string rptStart;
	string rptEnd;
	int maxFdp = -1;
	int maxExtension = -1;
	string isAugment;
};
//2124
class rule2124 : public ruleParams {
public:
	string composition;
	string bunk;
	int	   landingLower=0;
	int	   landingUpper=99;
	int	   blhLower=0;
	int    blhUpper=999999;
	int    fdpLower=0;
	int    fdpUpper=999999;
	string crossMidnight;
	string delayed;
	vector<string> assignments;
	int    minRest = -1;
	vector<string> attributes{};
	int	   dpLower = 0;
	int    dpUpper = 999999;
	vector<string> fleets;//机型
	vector<string> subFleets;//子机型
};
//8115
class rule8115 : public ruleParams {
public:
	string base;
	string rank;
	string fleet;
	vector<string> dutyAssignments;
	int maxTimezoneGap = 0;
	int vrAddMaxConseutiveTime = 0;
	int maxConseutiveTime = 0;
	string Unit;
	string lastDayMaxSta;
	string nextDayExtension;
};
//8116
class rule8116 : public ruleParams {
public:
	string base;
	string rank;
	string fleet;
	string team;
	string Unit;
	int maxAbroadDays = 0;
	int defaultOutOfBase = 0;
	int defaultReturnBase = 0;
	int ignoreReturnBase = 0;
};
//3010
class rule3010 : public ruleParams {
public:
	string airport ="*";
	string pFlightNumbers ="*";
	vector<string> flightNumbers;
	string pFleets = "*";
	vector<string> fleets;
	int depStart = 0;
	int depEnd = 24 * 60 - 1;
	string areaType = "*";
	int flyBrief = 30;
	int flyDebrief = 0;
	int dhdBrief = 0;
	int dhdDebrief = 0;
	int gtBrief = 0;
	int gtDebrief = 0;
	int otherBrief = 0;
	int otherDebrief = 0;
	int pickup = 0;
	int dropoff = 0;
};
//预处理8015
class rule8015 : public ruleParams {
public:
	string strRestType, strMinRest, strMinCalDays, strMinLocalNights, strLocationBase, strLabels, exceptionCode;//table1
	string strMaxSector, strMinFlightTime, strMinFDP, strStandbys;//table2
	int iMinRest = -1, iRequiredCalDays = 0, iMinLocalNights = 0, iMaxSector = 0;
	vector<string> exceptionCodeList; // eva 新增参数，匹配rosterFLight上的ts flag，如匹配上，则不校验8015
	vector<string> exceptionAssignmentGroups; //ROSCRW-9721 检查前后休息时，任务组内任务不破坏休息
};
//预处理7269（8015按计划时间分身）（EVA)
class rule7269 : public ruleParams {
public:
	string strRestType, strMinRest, strMinCalDays, strMinLocalNights, strLocationBase, strLabels, exceptionCode;//table1
	string strMaxSector, strMinFlightTime, strMinFDP, strStandbys;//table2
	int iMinRest = -1, iRequiredCalDays = 0, iMinLocalNights = 0, iMaxSector = 0;
	vector<string> exceptionCodeList; // eva 新增参数，匹配rosterFLight上的ts flag，如匹配上，则不校验8015
	vector<string> exceptionAssignmentGroups; //ROSCRW-9721 检查前后休息时，任务组内任务不破坏休息
};
//预处理8023
class rule8023 : public ruleParams {
public:
    string rBase = "*";
    string rRank = "*";
    string rFleet = "*";
    string rTeam = "*";
    string rGroup;
    string rMinDO;
    string rPeriod;
    string rUnit;
    string rMonthNumber = "*";
    string rLayoverTimemode;
    string rRefDate;
	string rRPDaysRange;
    bool rPostRest;
    bool rCountBlankDay;
    bool rCountLayover;
    bool rIsRolling;
	string rCheckType = "*";
	string rLastRosterLatestEndTime = "*";
	vector<string> rLastRosterAssignments;
};
//预处理8037
class rule8037 : public ruleParams {
public:
	string crewBase;
	string location;
	int maxDaysOutOfBase = 0;
	int maxDaysInLocation = 0;
};
//预处理8637
class rule8637 : public ruleParams {
public:
	string crewBase;
	string location;
	int maxDaysOutOfBase = 0;
	int maxDaysInLocation = 0;
};
//rule 8042
class rule8042 : public ruleParams {
public:
	string strNationality, strDeparture = "*", strArrival = "*", strMax, strRank, strBase, strMin, strFleet = "*", strActingRanks = "*", strNumbers = "*", strSegAssignGrps = "*", strDestinationCountries;
	bool isDirectional = 0;
	vector<string> nationalities, actingRanks, arrStations, depStations, fltNumbers, segAssignGrps,fltFleets,exceptNationalities,destinationCountries;
	string strCrewFleet = "*";
};

struct DtoUpdateCrew {
	vector<string> delCrewIds;
	vector<std::shared_ptr<CREW>> addOrUpdateCrews;
	map<string, std::shared_ptr<CREW>> addOrupdateCrewIdMap;
	vector<std::shared_ptr<CrewLastPublishDate>> updateCrewLastPublishDates;
};

//rule 8077
class rule8077 : public ruleParams {
public:
	string strNationalities, strMax, strRanks, strBases, strFleets,strDuty,strAttributes,strLabels,strActingRanks;
	vector<string> nationalities,labels,attributes,actingRanks;
};

//预处理8054
class rule8054 : public ruleParams {
public:
	string rFleet;
	string rGap;
	string rCrewBase;
	string rCrewRank;
	string rCrewFleet;
	string rMinTimes;
	string rOperate;
	string rAssignment;
	string rActingRank;
	string rQual;
	string rUnit;
	int iGapCD = 0;
	int iTimes = 0;
	map<string, bool> actingRankMap;
	map<string, bool> assignmentMap;
	std::vector<std::string> recencyFleetList;
	std::vector<std::string> qualifications;
};
//预处理8055
class rule8055 : public ruleParams {
public:
	string rFleet, rActingRank, rMinTimes, rQualification, strDep, strArr, rAttribute, rCrewNationality = "*", rRequired = "99", rGroups = "*";
	vector<string> strDepps, strArrs, strFleets, strAttributes, vAssignmentGroups, vAssignments;
	int iTimes = 0;
	int iRequired = 0;
};

//预处理8059
class rule8059 : public ruleParams {
public:
	string strBase;
	string strRank;
	string strQualifyDays;
	string strPercentage;
	string strAssignment;
	double percentageOfQCA = 0.0;
	int iQualifyDays = 0;
};
//预处理8064
class rule8064 : public ruleParams {
public:
	string strAttributeA, strAttributeB;
	string strIsReqA, strIsReqB, strQualA, strQualB;
	string strLabelA, strLabelB, strAssignmentA, strAssignmentB, strAEqualToBase = "*", strBEqualToBase = "*";
	string strBase, strRank, strFleet, strDirectional;
	bool bDirectional = false;
	vector<string> vecAttrA, vecAttrB, vecLabelA, vecLabelB;
	vector<string> vecAssignmentA, vecAssignmentB, vecQualA, vecQualB;
};
//预处理8071
struct roster_space{
    vector<string> attributes;//Pairing的Attribute
    vector<string> overrideDutyAttributes; //Duty的Attribute
	vector<string> assignments;
	vector<string> labels;
	vector<string> qualifiers;
	vector<string> destinations;
	vector<string> roles;
	vector<string> flightNumbers;
	vector<string> airports;
	vector<string> courseCodes;
	string		   isRequested = "*";
	string		   isLineTraining = "*";
	string		   crewBase = "";
	string		   strLocationSameTOBase = "*";
	string         strAirports = "*";
};
class rule8071 : public ruleParams {
public:
	roster_space rp;
	string rBases;
	string rRanks;
	string rFleets;
	string rPositions="*";
	string rTeams;
	string rFlightNums = "*";
	string rLabels;
	string rAttributes;//Pairing的Attribute
    std::vector<std::string> rOverrideDutyAttributes{}; //Duty的Attribute
	string rGroups;
	string rQualifiers;
	string rPeriod;
	string rDests;
	string rUnit;
	double dMax = 0.0; //mantis#2669, double
	double dMin = 0.0; //mantis#2669, double
	string rCheckMode; //检查频次的模式，P-任务环；F-航班。
};
//rule 8006
class rule8006 : public ruleParams {
public:
	string strBase;
	string strRank;
	string strFleet;
	string strTeam = "*";
	vector<string> attributes;
	vector<string> assignmentGroups;
	vector<string> crewNationality;//op#2390
};

//rule 8074
class rule8074 : public ruleParams {
public:
	string strBase;
	string strRank;
	string strFleet;
	string strTeam = "*";
};
//rule 8075
class rule8075 : public ruleParams {
public:
	string strNationality, strDeparture = "*", strArrival = "*", strMax, strRank, strBase, strMin, strFleet = "*", strCrewFleet = "*", strActingRanks = "*", strNumbers = "*", strSegAssignGrps = "*";
	bool isDirectional = false;
	vector<string> nationalities, actingRanks, arrStations, depStations, fltNumbers, segAssignGrps,fltFleets;
};
//预处理8008
class rule8008 : public ruleParams {
public:
	vector<string> strCrewNation;
	vector<string> vDocs;
	vector<string> vFltNums;
	map<string, bool> mFltNums;
	map<string, bool> mDocs;
	string strFltNums;
	vector<string> dest;
	vector<string> dept;
	string checkonType="S"; //S:SEGMENT/D:DUTY/P:PAIRING
	string types;
	string unit;
	int number = 0;
	int days = 0; //unit=M/Y/D days=number*31/365/1
	bool onlyCheckLo = false;
	vector<string> exceptionCrewNation;
	vector<string> notCheckCountries;//不检查Crew国籍所在国家内的航班
	vector<string> airports;
	string checkCtaOrMcl;
	vector<string> ignoreCertificatesForCtaOrMcl;
	string flightFlag;
	string rosterFlightAssignments;
};

//预处理8028
class rule8028 : public ruleParams {
public:
	vector<string> crewNationalities; //Crew Nationalities：机组国籍列表，支持*和|分开的多个国籍
	vector<string> fltNums; //Flight Numbers：不允许飞的航班号列表，支持*和|分开的多个值
	vector<string> fltCountries; //Flight Countries：不允许飞的航班落地国或起飞国家，支持*和|分开的多个值
	vector<string> fltTypes;//Flight Types：不允许飞的航班类型（D、I、R），支持*和|分开的多个值，数据取值：FLIGHT表的SEG_TYPE中
};

/*
start/end OR setValue should be set
*/
struct mandayTimes
{
	int types = 0; //计算manday的不同种类时间，来自枚举 CALCULATION_TYPES
	time_t start = 0;  //optional
	time_t end = 0;    //optional
	int setValue = 0;  //optional
	double percentage = 1.0;
	double credit_percentage = 1.0;
	string divide = "E";
	long adjustment = 0;
	int dp_gap = 0;
	int index = 0;
	long adjust_for_pr = 0;
	int beforePct = 0;
	int afterPct = 0;

	std::map<string, int> operating_fleets{};//执行任务的机型(多个|分隔）Map<机型，机型数量>
	std::map<string, int> operating_dep_airports{};//执行任务的起飞机场(多个|分隔，不包括基地）,Map<机场，机场数量>
	std::map<string, int> operating_arr_airports{};//执行任务的落地机场(多个|分隔，不包括基地）,Map<机场，机场数量>

	std::map<string, int> fleetTakeoff{};//特定机型起飞次数，map<机型,起飞次数>
	std::map<string, int> fleetLanding{};//特定机型降落次数，map<机型,降落次数>
	std::map<string, int> nightFleetTakeoff{};//夜航特定机型起飞次数，map<机型,起飞次数>
	std::map<string, int> nightFleetLanding{};//夜航特定机型降落次数，map<机型,降落次数>

public:
	void addOperatingFleets(const std::map<string, int>& other);

	void addOperatingFleets(const std::pair<string, int>& otherPair);

	void minusOperatingFleets(const std::map<string, int>& other);

	void minusOperatingFleets(const std::pair<string, int>& otherPair);

	void addOperatingDepAirports(const std::map<string, int>& other);

	void addOperatingDepAirports(const std::pair<string, int>& otherPair);

	void minusOperatingDepAirports(const std::map<string, int>& other);

	void minusOperatingDepAirports(const std::pair<string, int>& otherPair);

	void addOperatingArrAirports(const std::map<string, int>& other);

	void addOperatingArrAirports(const std::pair<string, int>& otherPair);

	void minusOperatingArrAirports(const std::map<string, int>& other);

	void minusOperatingArrAirports(const std::pair<string, int>& otherPair);

	void addFleetTakeoff(const std::map<string, int>& other);

	void addFleetTakeoff(const std::pair<string, int>& otherPair);

	void minusFleetTakeoff(const std::map<string, int>& other);

	void minusFleetTakeoff(const std::pair<string, int>& otherPair);

	void addFleetLanding(const std::map<string, int>& other);

	void addFleetLanding(const std::pair<string, int>& otherPair);

	void minusFleetLanding(const std::map<string, int>& other);

	void minusFleetLanding(const std::pair<string, int>& otherPair);

	void addNightFleetTakeoff(const std::map<string, int>& other);

	void addNightFleetTakeoff(const std::pair<string, int>& otherPair);

	void minusNightFleetTakeoff(const std::map<string, int>& other);

	void minusNightFleetTakeoff(const std::pair<string, int>& otherPair);

	void addNightFleetLanding(const std::map<string, int>& other);

	void addNightFleetLanding(const std::pair<string, int>& otherPair);

	void minusNightFleetLanding(const std::map<string, int>& other);

	void minusNightFleetLanding(const std::pair<string, int>& otherPair);

};

class MandayActivity : public Activity {

public:
	typedef enum {
		UNKNOWN = 0,
		FLIGHT_ROSTER = 1, //飞行排班
		GROUND_ROSTER = 2, //地面排班
		PAIRING = 3,
		DUTY = 4,
		SEGMENT = 5,

		CREDIT = 100, //Credit Hour
		PER_DIEM = 101, //每日津贴,Per Diem Hour
		WORKING_HOUR = 102 //工作时间,Working Hour
	}Type;

	typedef enum {
		NA = 0, //未定义
		CEIL = 1, //向上取整
		FLOOR = 2, //向下取整
		ROUND = 3,//直接取整
		NEARSET = 4 //四舍五入取整
	}RoundType;

	MandayActivity() {}

	MandayActivity(const MandayActivity::Type type) { this->_type = type; }

	string getClassName() const { return "MandayActivity"; }

	void setType(MandayActivity::Type type) { _type = type; }
	MandayActivity::Type getType() const { return _type; }

	void setRoundType(MandayActivity::RoundType roundType) { _roundType = roundType; }
	MandayActivity::RoundType getRoundType() const { return _roundType; }

	void setSubType(const int subType) { _subType = subType; }
	int getSubType() const { return _subType; }

	//const string& getTimeType() const { return _timeType; }
	//void setTimeType(const string timeType) { _timeType = timeType; }

	const string& getAssignment() const { return _assignment; }
	void setAssignment(const string assignment) { _assignment = assignment; }
	const string& getAssignmentGroup() const { return _assignmentGroup; }
	void setAssignmentGroup(const string assignmentGroup) { _assignmentGroup = assignmentGroup; }

	void setStartTimeUtcSch(time_t vl) { _schStartTimeUtc = vl; }
	time_t getStartTimeUtcSch() const { return _schStartTimeUtc; }
	void setEndTimeUtcSch(time_t vl) { _schEndTimeUtc = vl; }
	time_t getEndTimeUtcSch() const { return _schEndTimeUtc; }
	void setStartTimeLocSch(time_t vl) { _schStartTimeLoc = vl; }
	time_t getStartTimeLocSch() const { return _schStartTimeLoc; }
	void setEndTimeLocSch(time_t vl) { _schEndTimeLoc = vl; }
	time_t getEndTimeLocSch() const { return _schEndTimeLoc; }
	void setStartTimeUtcAct(time_t vl) { _actStartTimeUtc = vl; }
	time_t getStartTimeUtcAct() const { return _actStartTimeUtc; }
	void setEndTimeUtcAct(time_t vl) { _actEndTimeUtc = vl; }
	time_t getEndTimeUtcAct() const { return _actEndTimeUtc; }
	void setStartTimeLocAct(time_t vl) { _actStartTimeLoc = vl; }
	time_t getStartTimeLocAct() const { return _actStartTimeLoc; }
	void setEndTimeLocAct(time_t vl) { _actEndTimeLoc = vl; }
	time_t getEndTimeLocAct() const { return _actEndTimeLoc; }

	//计算使用开始时间和结束时间，UTC和本地
	void setCalcStartTimeUtc(time_t vl, const string timeType="ACT") {
		if (timeType == "SCH") {
			_calcSchStartTimeUtc = vl;
		}
		else {
			_calcActStartTimeUtc = vl;
		}
	}
	time_t getCalcStartTimeUtc(const string timeType = "ACT") const {
		return (timeType == "SCH") ? _calcSchStartTimeUtc : _calcActStartTimeUtc;
	}

	void setCalcEndTimeUtc(time_t vl, const string timeType = "ACT") {
		if (timeType == "SCH") {
			_calcSchEndTimeUtc = vl;
		}
		else {
			_calcActEndTimeUtc = vl;
		}
	}
	time_t getCalcEndTimeUtc(const string timeType = "ACT") const {
		return (timeType == "SCH") ? _calcSchEndTimeUtc : _calcActEndTimeUtc;
	}

	void setCalcStartTimeLoc(time_t vl, const string timeType = "ACT") {
		if (timeType == "SCH") {
			_calcSchStartTimeLoc = vl;
		}
		else {
			_calcActStartTimeLoc = vl;
		}
	}
	time_t getCalcStartTimeLoc(const string timeType = "ACT") const {
		return (timeType == "SCH") ? _calcSchStartTimeLoc : _calcActStartTimeLoc;
	}

	void setCalcEndTimeLoc(time_t vl, const string timeType = "ACT") {
		if (timeType == "SCH") {
			_calcSchEndTimeLoc = vl;
		}
		else {
			_calcActEndTimeLoc = vl;
		}
	}
	time_t getCalcEndTimeLoc(const string timeType = "ACT") const {
		return (timeType == "SCH") ? _calcSchEndTimeLoc : _calcActEndTimeLoc;
	}

	void setCalcDuration(double duration, const string timeType = "ACT") {
		if (timeType == "SCH") {
			_calcSchDuration = duration;
		}
		else {
			_calcActDuration = duration;
		}
	}
	//计算时长（单位：秒）如果返回值大于等于0(此时_calcDuration!=endTime - startTime)，则Duration不采用endTime - startTime 获得，直接使用该值。
	double getCalcDuration(const string timeType = "ACT") const {
		return (timeType == "SCH") ? _calcSchDuration : _calcActDuration;
	}

	long long getRosterId() const { return _rosterId; }
	void setRosterId(long long rosterId) { _rosterId = rosterId; }

	const string& getCrewId() const { return _crewId; }
	void setCrewId(const string crewId) { _crewId = crewId; }

	long long getPairingId() const { return _pairingId; }
	void setPairingId(long long pairingId) { _pairingId = pairingId; }

	long long getDutyId() const { return _dutyId; }
	void setDutyId(long long v) { _dutyId = v; }
	int	 getDutySeq() const { return _dutySeq; }
	void setDutySeq(int v) { _dutySeq = v; }

	long long getSegmentId() const { return _segmentId; }
	void setSegmentId(long long v) { _segmentId = v; }
	int getSegSeq() const { return _segSeq; }
	void setSegSeq(int v) { _segSeq = v; }

	const string& getTmGroupId() const { return _tmGroupId; }
	void setTmGroupId(const string tmGroupId) { _tmGroupId = tmGroupId; }

	string getRole() const { return _role; }
	void setRole(const string role) { _role = role; }

	double getPercent() const { return _percent; }
	void setPercent(const double percent) { _percent = percent; }

	double getMultiple() const { return _multiple; }
	void setMultiple(const double multiple) { _multiple = multiple; }

	const string& getSplitMethod() const { return _splitMethod; }
	void setSplitMethod(const string splitMethod) { _splitMethod = splitMethod; }

	int getDutyMinWorkingHour() const { return _whMinDutyMinutes; }
	void setDutyMinWorkingHour(const int dutyMinWorkingHourMinutes) { _whMinDutyMinutes = dutyMinWorkingHourMinutes; }

	const string& getExpression() const { return _expression; }
	void setExpression(const string& expression) { _expression = expression; }
public:

	/*
	* crewMandayActivities数据按天分组MandayActivity数据
	* @param crewMandayActivities
	* @return map<本地时间天,当天所有MandayActivity列表>
	*/
	static map<time_t, vector<SharedPtr<MandayActivity>>> getCrewMandayActivityGroupByDay(const vector<SharedPtr<MandayActivity>>& crewMandayActivities, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes, const string timeType="ACT");

	/*
	* crewMandayActivities数据按天合并统计
	* @param crewMandayActivitiesMap  <本地时间天,当天所有MandayActivity列表>
	* @return map<本地时间天,当天时长合计(秒数)>
	*/
	static map<time_t, double> merge(const map<time_t, vector<SharedPtr<MandayActivity>>>& crewMandayActivitiesMap, const string timeType);

	/*
	* crewMandayActivities数据按天合并
	* @param crewMandayActivities
	* @return map<本地时间天,当天时长合计(秒数)>
	*/
	static map<time_t, double> getCrewMandayGroupByDay(const vector<SharedPtr<MandayActivity>>& crewMandayActivities, const SharedPtr<CrewDataContext>& dbData, const int offsetTZMinutes, const string timeType = "ACT");
private:
	MandayActivity::Type _type = MandayActivity::Type::UNKNOWN;
	MandayActivity::RoundType _roundType = MandayActivity::RoundType::NA;
	int _subType = 0;

	time_t _schStartTimeUtc = -1;
	time_t _schEndTimeUtc = -1;
	time_t _schStartTimeLoc = -1;
	time_t _schEndTimeLoc = -1;
	time_t _actStartTimeUtc = -1;
	time_t _actEndTimeUtc = -1;
	time_t _actStartTimeLoc = -1;
	time_t _actEndTimeLoc = -1;

	time_t _calcSchStartTimeUtc = -1;
	time_t _calcSchEndTimeUtc = -1;
	time_t _calcSchStartTimeLoc = -1;
	time_t _calcSchEndTimeLoc = -1;
	time_t _calcActStartTimeUtc = -1;
	time_t _calcActEndTimeUtc = -1;
	time_t _calcActStartTimeLoc = -1;
	time_t _calcActEndTimeLoc = -1;

	double _calcSchDuration = -1;
	double _calcActDuration = -1;//计算时长（单位：秒)。如果_calcDuration大于0(此时_calcDuration!=endTime - startTime)，则Duration不采用endTime - startTime 获得，直接使用该值。

	long long _rosterId = 0;
	string    _crewId{};
	long long _pairingId = 0;
	long long _dutyId = 0;
	int _dutySeq = -1;
	long long _segmentId = 0;
	int _segSeq = -1;

	string _assignment{};
	string _assignmentGroup{};

	string _tmGroupId{};//roster的tmGroupId，training分组
	string _role{}; //roster的role

	////计算采用实际时间，还是计划时间。取值："SCH" - 计划时间，"ACT" - 实际时间
	//string _timeType;

	double _percent{-1}; //计算折算比例
	double _multiple{-1}; //计算加成

	//跨天分隔时长方式。若_splitMethod为空，等价于SPAN
	// 取值：SPAN -按实际的时间跨度进行切分，按[startTime,endTime]跨天时间长度进行分割
	// AVG - 按平均切割，若_calcDuration>=0，则按_calcDuration平均分隔；否则按'endTime-startTime'计算时长平均分隔
	string _splitMethod{};

	//扩展自定义字段区域
	int _whMinDutyMinutes = -1; //-1表示空，无意义

	string _expression; //计算表达式，供特殊规则使用。例如：Credit的GND
};

//8114
class rule8114 : public ruleParams {
public:
	vector<string> activeRankVec;
	vector<string> actingRankVec;
	vector<string> assignmentGroupVec;
	vector<string> flightFleetVec;
	string fleetSpecific;
	string exceptionCode;
};
//8092
class rule8092 :public ruleParams{
public:
	vector<string> CrewANalitiesVec;
	vector<string> CrewABaseVec;
	vector<string> CrewAAgeVec;
	vector<string> CrewARanksVec;
	vector<string> CrewAFleetVec;
	vector<string> CrewAActingRankVec;
	vector<string> CrewATeamVec;
	vector<string> CrewBNalitiesVec;
	vector<string> CrewBBaseVec;
	vector<string> CrewBRanksVec;
	vector<string> CrewBFleetVec;
	vector<string> CrewBAgeVec;
	vector<string> CrewBTeamVec;
	vector<string> FlightAssignmentVec;
	vector<string> CrewBQualificationVec;
	vector<string> divisionVec;
	vector<string> AttributesVec;
	vector<int> age;
	string alertMessage;

	int MinLimits = 0;
	int MaxLimits = 0;


};
//2030
class rule2030_2 :public ruleParams{
public:
	vector<string> fleetsVec;
	string composition;
	string division;
	int maxFdp = -1;
	int maxExtension = -1;
	bool isAugment = false;
};
//2130
class rule2130 :public ruleParams{
public:
	vector<string> fleetsVec;
	string composition;
	int crewNums = 0;
	string division;
	int maxFdp = -1;
	int maxExtension = -1;
	bool isAugment = false;
};

//预处理8056
class rule8056 : public ruleParams {
public:
	string strBase;
	string strRank;
	string strFleet;
	string strAttributeA;
	string strAttributeB;
	string strLabelA;
	string strLabelB;
	string strRolesA;
	string strRolesB;
	string strAssignmentA;
	string strAssignmentB;
	string strQualifierA;
	string strQualifierB;
	string strAEqualToBase;
	string strBEqualToBase;
	string strAirportsA;
	string strAirportsB;
	string strIsReqA;
	string strIsReqB;
	string strIsLineTrainingA;
	string strIsLineTrainingB;
	string strCourseCodeA;
	vector<string> courseCodesA;
	string strCourseCodeB;
	vector<string> courseCodesB;
	string strSpace;
	string strUnit;
	string strDirectional;
	string strUtilizePostRest;
	string strTeam;
};

//预处理7270，8056的分身，通过计划时间检查（EVA)
class rule7270 : public ruleParams {
public:
	string strBase;
	string strRank;
	string strFleet;
	string strAttributeA;
	string strAttributeB;
	string strLabelA;
	string strLabelB;
	string strRolesA;
	string strRolesB;
	string strAssignmentA;
	string strAssignmentB;
	string strQualifierA;
	string strQualifierB;
	string strAEqualToBase;
	string strBEqualToBase;
	string strAirportsA;
	string strAirportsB;
	string strIsReqA;
	string strIsReqB;
	string strIsLineTrainingA;
	string strIsLineTrainingB;
	string strSpace;
	string strUnit;
	string strDirectional;
	string strUtilizePostRest;
	string strTeam;
};

//预处理8126
class rule8126 : public ruleParams {
public:
	string strBases;
	string strRanks;
	string strFleets;
	string strTeams;
	string strPilots;
	string strAttributes;
	string strFlights;
	string strAirports;
	string strCombinations;
	string strAssignments;
	string strActingRanks;

	vector<string> vAttributes;
	vector<string> vFlights;
	vector<string> vAirports;
	vector<string> vRanks;
	vector<string> vAssignments;
	vector<string> vActingRanks;

	vector<vector<string>> strCheckQuals;
};

//预处理8117
class rule8117 : public ruleParams {
public:
	string strBases;
	string strRanks;
	string strFleets;
	string strTeams;
	string strPilots;
	string strAttributes;
	string strDeps="*";
	string strArrs="*";
	string strAirports="*";
	string strCombinations;
	string strAssignments;
	string strActingRanks;
	string strFltFleets="*";
	string strNationality="*";
	string strFlights="*";
};
//8141
class rule8141 :public ruleParams{
public:
	vector<string> baseVec;
	vector<string> rankVec;
	vector<string> fleetVec;
	vector<string> crewTeamVec;
	vector<string> assignmentVec;
	int period = 0;
	string unit;
	int maxTimes = 0;
	int minTimes = 0;
};
//3021
class rule3021 :public ruleParams{
public:
	// Optional discriminator for report time rows.
	// Use pairing division semantics: "P" (flight crew), "C" (cabin crew), "*" (any).
	// When unset in data, defaults to "*" for backward compatibility.
	string division = "*";
	string airport;
	int depStart = 0;
	int depEnd = 0;
	string dutyType;
	vector<string> fltNumsVec;
	vector<string> fleetsVec;
	vector<string> assignment;
	vector<string> dutyAssignments;
	vector<string> airlines;
	shared_ptr<bool> isTraining{ nullptr };
	vector<string> pairingBases;//Pairing Base列表，多个使用|分割，支持*表示忽略该参数
	vector<string> routes; //航线代码列表，Duty第一个航班起飞和落地机场匹配到航线。多个使用|分割，支持*表示忽略该参数
	time_t effDate = 0;
	time_t expDate = 0;
	int briefTime = 0;
	int maxFdpBriefTime = -1;
	vector<string> courses;
	string endAirport = "*";
	int dutyBlhRangeLower = 0;
	int dutyBlhRangeUpper = 0;
	int sectorBlhRangeLower = 0;
	int sectorBlhRangeUpper = 0;
};
class rule3022 :public ruleParams{
public:
	string airport;
	string dutyType;
	vector<string> fltNumsVec;
	vector<string> fleetsVec;
	vector<string> assignment;
	vector<string> airlines;
	shared_ptr<bool> isTraining{ nullptr };
	time_t effDate = 0;
	time_t expDate = 0;
	int debriefTime = 0;
	vector<string> courses;
	vector<string> pairingBases;//Pairing Base列表，多个使用|分割，支持*表示忽略该参数
};
class rule3023 :public ruleParams{
public:
	vector<string> pairingBases;
	shared_ptr<bool> isLayover{ nullptr };//Duty的开始前面是否有Layover，匹配参数。格式：Y/N，支持*表示忽略
	string airport;
	int depStart = 0;
	int depEnd = 0;
	string dutyType;
	vector<string> fltNumsVec;
	vector<string> fleetsVec;
	vector<string> assignment;
	vector<string> airlines;
	int pickupTime = 0;
	time_t effDate = 0;
	time_t expDate = 0;
};
class rule3024 :public ruleParams{
public:
	vector<string> pairingBases;
	shared_ptr<bool> isLayover{ nullptr }; //Duty的结束后面是否有Layover，匹配参数。格式：Y / N，支持 * 表示忽略
	string airport;
	string dutyType;
	vector<string> fltNumsVec;
	vector<string> fleetsVec;
	vector<string> assignment;
	vector<string> airlines;
	int dropoffTime = 0;
	time_t effDate = 0;
	time_t expDate = 0;
};
//------------ RULE -------------
#define     RULE_PHASE_ALL     0
#define     RULE_PHASE_PLAN    1
#define     RULE_PHASE_ASSIGN  2
#define     RULE_PHASE_TRACK   3

//#define     RULE_DESC_LEN      60
#define     RULE_INFO_LEN      20
#define     RULE_DESC_LEN      200

#define     RULE_STORE_TYPE_NORMAL	     ""
#define     RULE_STORE_TYPE_MIX          "Mix"
#define     RULE_STORE_TYPE_TALBE        "Table"
#define     RULE_STORE_TYPE_MULTI_TABLE  "MultiTable"

struct LiveConfig {
	long long id = 0;
	string filiale;
	string division;
	long long ruleSetId = -1;
	bool defaultRuleSetFlag = false;
	string module; //取值：TRACKING，ALLOWANCE，DUTYSWAP 等
};

struct RuleSet {
	long long id = 0;
	long long ruleId = 0;
	long long worksetId = 0;
};

struct DBRule {
	long long idRuleSet = 0;
	long long idRule = 0;
	unsigned int    function = 0;
	char   classType[RULE_INFO_LEN]{};     //P:PAIRING, R:ROSTER, B:Both, S: ,C：
	char   description[RULE_DESC_LEN + 1]{};
	char   storeType[RULE_INFO_LEN]{};     //RULE_STORE_TYPE_NORMAL/ RULE_STORE_TYPE_TALBE/ RULE_STORE_TYPE_MULTI_TABLE

	long long phase = 0;                              //RULE_PHASE_PLAN/ RULE_PHASE_ASSIGN/ RULE_PHASE_TRACK

	int    tableNum = 0;
	int    rowNum = 0;

	int    severity = 0;                     //SEVERITY:1\2\3\4\5...

	string overridebility;               //H:hard, S:soft
	string source;
	string reference;
	string category;
	string exceptionCode;   //异常代码，多个使用|分隔
	std::set<std::string> exceptionCodes{};
	long long idRuleParam = 0;
	map<string, string> params;
	vector<DBPortQualReqmnts> * specialRulePortQualReqmnts{};

	std::shared_ptr<ruleParams> parsedParam;

	void copyFrom(DBRule* rule);

	static bool compare(DBRule& r1, DBRule& r2);
	string getRuleParamValue(string name);
};

struct DBRule_CrossRank {
	long long criteria_id = 0;
	string airline;
	string division;
	string crew_group;
	int cof = 0;
	string fleet;
	string dep_arp;
	string arv_arp;
	string qual_list;
};


//class DBRule_CrewRecency {
//public:
//	long long scenarioId;
//	string idcrew;
//	time_t crewDateUtc = 0;
//	//string airport;
//	string devAirport;
//	string arvAirport;
//	string operate;
//	string status;
//	string fleet;
//	string approach;
//	string unit;
//	int times = 0;
//	string role;
//	string actingRank;
//	long long rosterId = 0;
//	long long trainingId = 0;
//	string remark;
//	string iduser;
//	time_t tmst = 0;
//	void copy(DBRule_CrewRecency* other);
//};
//class RecencyHashOld {
//public:
//	size_t operator() (std::shared_ptr<DBRule_CrewRecency> const& key) const;
//};
//class RecencyEqualOld {
//public:
//	bool operator() (std::shared_ptr<DBRule_CrewRecency> const& t1, std::shared_ptr<DBRule_CrewRecency> const& t2) const;
//};
////mantis#1958, 自定义 hash, equal，确保unordered_set<recency>中相同 crew/dep/arv/fleet/role/rank只保留最新的数据
//class RecencySetWithHashAndEqual : public unordered_set < std::shared_ptr<DBRule_CrewRecency>, RecencyHashOld, RecencyEqualOld > {};

struct DBRule_8014 {
	string airline;
	string assignmentGroup;
	string assignemnt;
	string name;
	string roIndicator;
};
//------------ CQF -------------
struct DBCqf {
	long long idCqfSet = 0;
	long long idCqf = 0;
	int    function = 0;
	string description;
	string paramNames;
	vector<string> paramValues;
};
//------------- resource ctrl base BLH ---------------
struct ResourceCtrlBaseBlh {
	string base;
	string fleet;
	double blhHour = 0.0;
	double blhHourMin = 0.0;
	double blhHourMax = 0.0;
};


//------------- CONTEXT -------------

//-------------------- COMPOSITION ------------------
struct rank_value {
	char rank[10] = { 0 };
	int plan_value = 0;
};

// 8091计算配比
struct CalcRankCombinationCtx {
	CrewDataContext* dbData;
	map<long long, Segment*> fltIdMap;
	map<long long, vector<Pairing*>> segToPairing;
	int errorCount = 0;
};

#define COMPOSITION_RANK_MAX_COUNT 100
struct composition_rank {
	char   airline[10] = { 0 };
	char   division[3] = { 0 };
	long long comp_id = 0;
	rank_value rankValue[COMPOSITION_RANK_MAX_COUNT];
	int    rankCount = 0; //MAX=10
	int    hierarchy = 0; //composition.hierarchy
};
struct composition_covered {
	long long flt_id = 0;
	char   rank[20] = { 0 };
	int    plan_value = 0;
};

class PairingDBContext {
public:
	//OCI_Connection *conn;
	//OCI_Statement  *stmt;
	//OCI_Error      *errorCodeOCI;
	int            errorCodeWin32 = 0;
	int            errorCode = 0;
	char           errorMsgBuf[1024] = { 0 };

	char           url[1024] = { 0 };
	char           username[1024] = { 0 };
	char           password[1024] = { 0 };
	//vector<std::shared_ptr<CREW>>   crewListCache;
	//unordered_map<string, CREW> crewMapCache;
	//~PairingDBContext();
	//void init(const char* url, const char* user, const char* passwd);
	//static PairingDBContext* getDbConnection();
};
//------------- Crew On Flight -------------
class CrewOnFlight {
public:
	long long fltId = 0;
	long long pairingId = 0;
	int seqOrder = 0;
	string crewId;
	string actingRank;
	string assignment; //segment assignment
	string role;
	string subRole;
	string source;//mantis#6474,cof.source
	string pairingPrimeActivity;//for COP

	long long dutyId = 0;
	long long rosterId = 0;
	std::string fltDt;
	string division;
	string activeRank;
	string position;
	string checkType;
	string tsFlag;
	std::set<string> tsFlags;
	string resourceCode;
	string groupId;
	long long tmProgramCourseId = 0;
	long long parentTmProgramCourseId = 0;
	std::string courseCode;
	bool isExtraCourse = false;
	long long subTmProgramCourseId = 0;
	string subCourseCode;
	long long subParentTmProgramCourseId = 0;

	std::string accState;//适应状态
	int accTimezone = -1; //适应时区(分钟数)

	bool isAgreeWork = false;  //是否同意工作
	string exceptionCode;   //异常代码，多个使用|分隔
	std::set<std::string> exceptionCodes{};

	std::shared_ptr<CREW> crew = nullptr;
};
//------------- CrewDataContext -------------
//回调函数，用于在addRoster/ delRoster时引入外部逻辑处理数据，如调用ruleEngine的计算逻辑
//typedef bool (__stdcall *Callback_ReCalcMandayForRoster)(CREW * crew, std::shared_ptr<ROSTER> roster, bool operation);

class MandayForRosterCalculator {
public:
	virtual bool reCalculateSingleRosterManday(std::shared_ptr<CREW> crew, std::shared_ptr<ROSTER> roster, bool operation) = 0;
	virtual void resetRoseter(int rosterIndex, std::shared_ptr<CREW> crew) = 0;

	//roster的Pairing发生变更时调用
	virtual void updatePairing(std::shared_ptr<CREW> crew, std::shared_ptr<ROSTER> roster, Pairing* oldPairing) = 0;
	virtual void resetPairing(std::shared_ptr<CREW> crew, std::shared_ptr<ROSTER> roster, Pairing* newPairing) = 0;
};

//------------- PO STRUCT START ---------------
//------------ optimization_necessity --------------
struct Optimization_necessity {
	string airline;
	string category;
	string division;
	string componentType;
	int func = 0;
	string name;
	string necessity;
	string user;
	time_t tmst = 0;
};
//按 pairing配比中 rank.division计算 pairing所属 division=P|C|A，可多选
struct RankDivision {
	bool hasP = false;
	bool hasC = false;
	bool hasA = false;
	bool has(string division); //division = P/ C/ A
};
//------------- PO STRUCT END ---------------

#define CREW_APP_TYPE_RULESRV  "RuleSrv"   //no input logs/ no pre-assign roster
#define CREW_APP_TYPE_OR       "OR"

//申请排班和交换排班
struct RequestRoster {
	vector<SharedPtr<ROSTER>> addedRosters;

	vector<SharedPtr<ROSTER>> removedRosters;

	set<string> changedCrewIds;//每次请求涉及crewId，这些Crew的pairing会重新创建，因此请求后需要释放

	set<long long> changedPairingIds;//每次涉及Pairing，这些pairing会重新创建，因此请求后需要释放
};

//将数据按场景打包处理，方便数据维护，如裸指针缓冲的维护
class CrewDataContext {
public:
	CrewDataContext();
	CrewDataContext(string applicationType);
	CrewDataContext(string applicationType, bool configInputLog);
	~CrewDataContext();

	static shared_ptr<CrewDataContext> createTransactionData(const shared_ptr<CrewDataContext>& crewDataContext);

	//仅动态数据成员变量才深度复制
	static void copyTransactionData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData);

	//所有成员变量深度复制
	static void copy(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData);

	//更新静态基础数据
	static void updateBaseData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData, const string& changeType);

	void init(string applicationType);

	//重新深度构造对象,crewIds:与该crew有关所有对象重新创建，包括：crew、roster、pairing、duty、segment、flight、rosterFlight等
	void recreate(const set<string>& changedCrewIds, const set<long long>& changedPairingIds);

	/*每次请求必须重置数据*/
	void reset();

	int loadData(long long scenarioId, string loginUser="");
	int loadDataTO(long long scenarioId, string loginUser="");
	int loadDataByPairing(long long scenarioId, vector<long long>& pairingIds);
	int loadDataByFlight(long long scenarioId, vector<long long>& flightIds, string filiale, string division);
	int loadDataByCrew(long long scenarioId, vector<string>& crewIds, time_t start, time_t end);
	int loadData(long long scenarioId, time_t startDtLoc, time_t endDtLoc, long long ruleSet, string baseIds, string rankIds, string fleetIds, string division);
	int saveRo();
	int saveTo(std::vector<Pairing*> &pairings);
	int saveManday(const unordered_map<long long, std::shared_ptr<ROSTER>>& orgRosterMap);
	int saveRecency();
	int saveSeqOrder();
	//int saveReCalculatePairingRosterManday();
	int saveFlightChange(vector<long long>& fltIds);
	int saveRosterDP();
	int savePairingTag();
	int updateScenarioState(long long scenarioId, string state);

	int loadRoster(vector<long long>& scenarioIds, time_t startUtc, time_t endUtc, vector<std::shared_ptr<CREW>>& crewList);
	int loadScenarioIdGroup(long long parentScenarioId, vector<long long>& result) ;

	//--------------- PO -----------------
	//根据 config调用 db或 server
	int loadDataPO(long long scenarioId);
	int saveDataPO(vector<Pairing*>& pairingList, vector<Segment*> &imbalanceSegments);

	int loadDataPoCsv(char * filepath);
	int savePoCsv(char * filepath, vector<Pairing*>& pairingList, vector<Segment*> &imbalanceSegments);
	int loadDataPoFromHttpServer(long long scenarioId);
	int loadDataPoFromHttpServer(long long scenarioId, const char * txtFilepath);
	int saveDataPoToHttpServer(char * filepath);

	//-------------TO Training Interface------------------
	//对学员训练课程(ProgramCourse)进行排课(Roster)
	std::tuple<std::shared_ptr<TmProgramCourse>, std::shared_ptr<RosterFlight>> updateProgramCourseTO(ROSTER* roster, const long long programCourseId, const long long fltId, const string& resourceCode, bool needCreateSubTm, const string& role = "TE");

	//给教员分配课程(ProgramCourseInstructor和Roster)
	std::tuple<std::shared_ptr<TmProgramCourseInstructor>, std::shared_ptr<RosterFlight>> createProgramCourseInstructorTO(ROSTER* roster, const long long courseId, const long long fltId, const string& resourceCode, const string& role, const std::shared_ptr<TmProgramCourse>& subProgramCourse = nullptr);

	//计算Training Duty签到和签出(与Rule 7228逻辑类似)，并更新Duty和Pairing Duty Node
	void calcTrainingDutyBriefAndDebriefTO(Duty* duty, Segment* segment, const long long courseId, const string& role);

	//delRoster调用清除Training相关数据（包括rosterFlight、programCourse、programCourseInstructor）
	void delTrainingRosterTO(SharedPtr<ROSTER>& roster);

	//json

	//------------- CSV load/save ------------
	int loginAsUserFromHttpServer(string username);
	int loadDataFromHttpServer(long long scenarioId, string loginUser = "");
	int loadDataFromHttpServerTO(long long scenarioId, string loginUser = "");
	int loadDataByPairingFromHttpServer(long long scenarioId, vector<long long>& pairingIds);
	int loadDataByFlightFromHttpServer(long long scenarioId, vector<long long>& fltIds, string filiale, string division);
	int loadDataByCrewFromHttpServer(long long scenarioId, vector<string>& crewIds, time_t start, time_t end, string division = "");
	int loadRosterFromHttpServer(vector<long long>& scenarioId, time_t startUtc, time_t endUtc, vector<string>& crewIds, bool needPreAssign, vector<shared_ptr<ROSTER>>& result);
	int loadDataFromHttpServer(long long scenarioId, time_t startDtLoc, time_t endDtLoc, long long ruleSet, string baseIds, string rankIds, string fleetIds, string division);
	int loadScenOfGrpFromHttpServer(long long scenarioId, vector<long long>& result);
	int saveDataToHttpServer(const char * filepath, string restfulApi = "/api/orengine/ro/solution");
	int saveToDataToHttpServer(const char * filepath, string restfulApi = "/api/orengine/to/solution");
	int updateScenStatusByHttp(long long scenarioId, string status);
	int loadScenarioCategory(long long scenarioId, char* categoryBuf);
	int loadDataCsv(const char * csvfile);
	int loadRosterCsv(const char * filepath, vector<shared_ptr<ROSTER>>& result);
	int saveRoCsv(const char * filepath); //save roster/ manday/ recency
	int saveToCsv(const char * filepath, std::vector<Pairing*> &pairings);
    void setPairingFleetGrpBySegmentForTo(std::vector<Pairing*>& list);
	void resetPairingStartByPickupForTo(std::vector<Pairing*>& list);
	int saveScenarioCsv(const char * filepath);
	int saveMandayCsv(const char * filepath, time_t startDtLoc, time_t endDtLoc, const unordered_map<long long, std::shared_ptr<ROSTER>>& orgRosterMap);
	int saveRosterFlightCsv(const char * filepath, time_t startDtLoc, time_t endDtLoc);
	int saveRecencyCsv(const char * filepath);
	int saveFlightChange(const char* filepath, vector<long long>& flightIds);
	int savePairingTagChange(const char* filepath);
	int loadDataUpdateCrew(const char * filepath,DtoUpdateCrew& dto);
	int saveRefreshDP(const char* filepath);
	void makeCrewGuaranteeFlyHours();

	string filterQualsByCombsRules();


	std::shared_ptr<ROSTER> addRoster(ErrorContext * errCtx, std::shared_ptr<ROSTER>& paramValue, bool checkOverlap);
	std::shared_ptr<ROSTER> addRoster(ErrorContext * errCtx, std::shared_ptr<CREW> &crew, Pairing* pairing, string &rank, bool needRuleCheck, bool checkOverlap=true, int seqOrder = 0);  //给指定crew增加roster到rosterList, 返回新增的Roster,增加seqOrder实参
	void addGroundRoster(ErrorContext * errCtx, std::shared_ptr<CREW> &crew, std::shared_ptr<ROSTER>& roster);
	std::shared_ptr<ROSTER> delRoster(ErrorContext * errCtx, std::shared_ptr<ROSTER>& findValue);
	std::shared_ptr<ROSTER> delRoster(ErrorContext * errCtx, std::shared_ptr<CREW> &crew, Pairing* pairing, string &rank);                      //从指定crew移除roster从rosterList, 返回移除的Roster
	std::shared_ptr<ROSTER> delRoster(ErrorContext * errCtx, std::shared_ptr<CREW> &crew, int index);
	std::shared_ptr<ROSTER> delGroundRoster(ErrorContext * errCtx, std::shared_ptr<CREW> &crew, SharedPtr<ROSTER>& paramValue);

	//CACC PRELOCK START
	std::shared_ptr<ROSTER> addDXYRoster(ErrorContext * errCtx, std::shared_ptr<CREW> &crew, Pairing* pairing, string &rank, bool needRuleCheck, bool checkOverlap, int seqOrder);
	//CACC PRELOCK END

	bool addPairing(ErrorContext * errCtx, Pairing * pairing);
	bool delPairing(ErrorContext * errCtx, long long pairId);

	void updatePairing(ErrorContext * errCtx, Pairing* pairing);
	void updateRoster(ErrorContext * errCtx, std::shared_ptr<ROSTER>& rosterData);

	void updateFlight(ErrorContext * errCtx, Segment* flt, const unordered_multimap<long long, Segment*>& flightIdToPairingSegment);

	std::shared_ptr<ROSTER> findRoster(const long long rosterId) const;

	std::shared_ptr<ROSTER> findRoster(const string& crewId, const long long rosterId) const;

	std::shared_ptr<ROSTER> findRosterByPairing(const string& crewId, const long long pairingId) const;

	void cleanRoster();                                                                           //clean: rollback, 将rosterList回复为pre-assign结果//前次or计算结果也会被丢弃
	void refreshRosterIndexOfCrew(std::shared_ptr<CREW> &crew);                                         //刷新指定crew下属rosterList中各项的索引indexInRosterListOfCrew

	string findAirportCountry(const string &airport);
	int getDefaultTimeZone();

	RankDivision getPairingRankDivision(long long pairingId);

	//计算Crew的Roster的所属phase
	void calcuateRulePhases(std::shared_ptr<CREW>& crew, const time_t currTimeUtc);
	//计算Pairing的所属phase
	void calcuateRulePhases(Pairing* pairing, const time_t currTimeUtc);
	//计算Manday的所属phase
	void calcuateRulePhases(CREW_MANDAY_BASIC* manday, const std::shared_ptr<CREW>& crew, const time_t currTimeUtc, const int mainBaseTimeZone);

	vector<std::shared_ptr<ROSTER>>   preAssignRosterList;                                              //预占roster列表（scenario：0）
	vector<std::shared_ptr<ROSTER>>   rosterList;                                                       //所有roster列表，包括当前scenario的和scenario：0（预占）
	vector<std::shared_ptr<ROSTER>>   preAssignRosterGroundList;										  //预占rosterGround列表（scenario：0）

	map<long long, std::shared_ptr<ASSIGNMENT>> totalAssignmentIdMap;                                         //包含所有assignment， 内容为map<assignment_id, assignment>
	map<string, std::shared_ptr<ASSIGNMENT>> assignmentNameMap;

	//简便起见全部public
	int                         version = 0;//20201021 区分版本2.0/3.0
	string						loginDivision;//20201021 客户端登录division
	map<string, vector<string>> divisionConstruction;//根据divisionContruction赋值配比
	long long                         scenarioId = -1;
	long long                         leadinScenarioId = -1; //for PO
	Scenario                    scenario;
	time_t                      startUtc = -1; //LOCAL 00:00 in UTC
	time_t                      endUtc = -1;   //LOCAL 23:59 in UTC

	vector<std::shared_ptr<Segment>>  flightList;                     //按 scenario.start/end/fleet/筛选航班
	unordered_map<long long, std::shared_ptr<Segment>>    flightIdMap;//Segment是航班
	unordered_map<time_t, vector<std::shared_ptr<Segment>>>		  flightDateMap; //航班日期map，key是utc

	unordered_map<long long, Segment*>	ferryFltIdMap;
	//flight对于pairing的索引 每次都需更新
	unordered_map<long long, vector<long long>> flightIdToPairing;
	vector<long long>                 otherScenarioInSameGroup;              //同组其他scenario id
	vector<Pairing*>            pairingList;                    //pairing全集，包括场景条件筛选、预占
	vector<Pairing*>            pairingListForRO;               //用于RO计算的 pairing，只包含来自 idscenario_pair的部分
	vector<Pairing*>            pairingListForROWithOpenComposition;     //用于OR作为输入：指定rank还有剩余openComposition的pairing
	vector<Pairing*>            preAssignPairingList;           //预占roster覆盖pairing
	vector<csvActivityComposition>		pairingCompositionList;         //用于RuleTool输出

	vector<std::shared_ptr<CREW>>		crewList;                       //
	//vector<std::shared_ptr<CREW>>     crewOfCofList;                  //
	vector<std::shared_ptr<CREW>>     crewTotalList;                  //所有crew 包括cof
	map<string, std::shared_ptr<CREW>> crewIdMap;                      //map<idcrew, crew>以便动态查找crew数据，value来自 crewTotalList
	vector<std::shared_ptr<LiveConfig>>   liveConfigList;
	vector<std::shared_ptr<RuleSet>>   ruleSetList;
	vector<DBRule>              ruleList;//法规规则明细
	vector<DBRule>              allRuleList;//所有法规规则明细（法规服务化使用）
	unordered_map<long long, std::shared_ptr<RulePhaseConfig>> rulePhaseConfigMap; //<id,RulePhaseConfig>
	vector<DBCqf>               cqfList;
	vector<DBRule>              cqfList2;                       //为统一rule、cqf读取逻辑，过渡阶段增加以rule方式读取cqf
	vector<std::shared_ptr<Holiday>>  holidays;                       //按airline和场景时间段筛选holiday
	vector<DBAirport>           airportList;
	std::vector<QUALIFICATION> qualificationList;
	std::unordered_map<std::string, QUALIFICATION> qualificationMap;
	vector<RANK>                rankList;
	map<string, RANK>           rankMap;
	map<string, set<string>>    rankToPositionMap;
	vector<Team>				teamList;
	vector<FLEET>               fleetList;
	vector<SUB_FLEET>			subFleetList;
	vector<std::shared_ptr<Dictionary>>  dictionaryList;
	map<string, vector<std::shared_ptr<Dictionary>>> dictionaryMap; //<code,vector<Dictionary>>，包含所有子节点
	vector<RosterPeriod>        rosterPeriodList;
	vector<std::shared_ptr<GuaranteeFlyHours>>   guaranteeFlyHoursList;
	map<string, FLEET>			fleetMap;
	map<string, SUB_FLEET>		subFleetMap;
	vector<DBPortQualReqmnts>   portQualReqmnts;
	map<string, vector<DBPortQualReqmnts>> portQualReqmntsAirportMap;
	unordered_map<string, int>          airportUtcOffsetMap; //机场的时区offset对应表，机场三字码 -> 时区分钟数，如北京8时区对应值为8*60=480
	unordered_map<string, string>       airportZoneIdMap; //机场的ZoneId对应表，机场三字码 -> ZoneId
	vector<std::shared_ptr<QualExtensionConfig>>			qualExtensionConfigList;
	map<string, multimap<string, std::shared_ptr<QualExtensionConfig>>> qualExtensionConfigMap;  //map<assignment, multimap<qual,QualExtensionConfig>>
	//待废弃的函数，不支持夏令时。请改用DutyUtils::GetTimeZoneOffset, TimezoneUtils::GetTimezoneOffset
	int getAirportOffsetMinutes(string airport);
	string getAirportZoneId(const string& airport) const;
	int getCrewBaseOffsetMinutes(string idcrew, time_t timeUtc);

	unordered_set<string>& getAssignmentsInGroup(const string& group);
	bool isAssignmentIncludeOrInGroup(string assignment, std::shared_ptr<RankCombinationCriteria> rankComb);
	bool isAssignmentInGroup(const string &assignment, const string &group);                                    //检查指定assignment是否在指定group中存在
	bool isAssignmentInGroup(const string& assignment, const std::vector<string>& groups);                                    //检查指定assignment是否在指定group中存在
	vector<string>& getRule8014AssignmentsByGrps(string rDutyGroup);                                            //按 rDutyGroup筛选8014

	//
	void updateActivityId(bool& isReindexAfterUpdateRosterId, const SharedPtr<UpdateActivityIdItem>& updateActivityIdItem, const vector<SharedPtr<UpdateActivityIdItem>>& updateDutyIdList);

	//使用rosterId的类，重新更新ID
	void updateRosterId(const long long oldId, const long long newId);

	void reindexAfterUpdateRosterId();

	//使用programCourseId的类，重新更新ID
	void updateTmProgramCourseId(const long long oldId, const long long newId);

	//使用programCourseInstructorId的类，重新更新ID
	void updateTmProgramCourseInstructorId(const long long oldId, const long long newId);

	//使用programCoursePnrId的类，重新更新ID
	void updateTmProgramCoursePnrId(const long long oldId, const long long newId);

	//使用programId的类，重新更新ID
	void updateTmProgramId(const long long oldId, const long long newId);

	//使用programBuddyId的类，重新更新ID
	void updateTmProgramBuddyId(const long long oldId, const long long newId);

	//使用programBuddyTimeId的类，重新更新ID
	void updateTmProgramBuddyTimeId(const long long oldId, const long long newId);

	//使用programBuddyCourseId的类，重新更新ID
	void updateTmProgramBuddyCourseId(const long long oldId, const long long newId);

	//使用programPipId的类，重新更新ID
	void updateTmProgramPipId(const long long oldId, const long long newId);

	//使用programCourseLimitationId的类，重新更新ID
	void updateTmProgramCourseLimitationId(const long long oldId, const long long newId);

	//使用programCourseRoleId的类，重新更新ID
	void updateTmProgramCourseRoleId(const long long oldId, const long long newId);

	//使用programCourseRoleQualId的类，重新更新ID
	void updateTmProgramCourseRoleQualId(const long long oldId, const long long newId);

	//使用programCourseIpRoleId的类，重新更新ID
	void updateTmProgramCourseIpRoleId(const long long oldId, const long long newId);

	//使用programCourseIpRoleBaseId的类，重新更新ID
	void updateTmProgramCourseIpRoleBaseId(const long long oldId, const long long newId);

	//使用programCourseIpRoleQualId的类，重新更新ID
	void updateTmProgramCourseIpRoleQualId(const long long oldId, const long long newId);

	//使用programCourseRoleLimitationId的类，重新更新ID
	void updateTmProgramCourseRoleLimitationId(const long long oldId, const long long newId);

	//使用programCourseIpckId的类，重新更新ID
	void updateTmProgramCourseIpckId(const long long oldId, const long long newId);

	//使用programCourseMoreLegId的类，重新更新ID
	void updateTmProgramCourseMoreLegId(const long long oldId, const long long newId);

	//使用programCourseMoreId的类，重新更新ID
	void updateTmProgramCourseMoreId(const long long oldId, const long long newId);

	//使用deviceTimeId的类，重新更新ID
	void updateTmDeviceTimeId(const long long oldId, const long long newId);

	//组建 flight->pairing索引
	void makeSegmentToPairingMap();
	//获得默认机组人员配比
	std::string getDefaultComposition(const string& defaultCompositionMode);
	//获得主基地时区
	int getMainBaseTimeZone() const;
	double getRouteRadiationConfigBySegment(const Segment* seg);
	double getRouteRadiationConfigBySegmentAndTime(const Segment* seg, const time_t day);
	map<long long, list<std::shared_ptr<CrewOnFlight>>> crewOnPairing; // key:pairingId, value:crewId list
	//multimap<long long, string> crewOnPairing; // key:pairingId, value:crewId list

	unordered_map<long long, vector<std::shared_ptr<CrewOnFlight>>>  crewOnFlt; //key:fltId, value: CrewOnFlight list
	vector<DBRankActing>                   rankActingList;
	//记录可以不检查休息的duty类型搭配
	vector<std::shared_ptr<ASSIGNMENT_OVERLAPPABLE>>					assignmentMrtOveride;
	vector<std::shared_ptr<ASSIGNMENT_OVERLAPPABLE>>					assignmentOverlappableType;
	vector<std::shared_ptr<DBRule_CrossRank>>    crossRankRuleList;
	vector<std::shared_ptr<DBRule_8014>>         rule_8014;
	//map<string, RecencySetWithHashAndEqual> crewRecencyMap;     //按crewId/dep/arv/fleet/role/rank保存最新recency, 通过 unordered_set<recency, hash, equal>排除重复
	RecencyMgr                             recencyMgr;
	RosterFlightMgr                        rosterFlightMgr;
	//CREW_TEAM_DATA                         crewTeam;  //数据接口： crewTeam.getTeamByCrew(string idcrew);

	map<long long, vector<std::shared_ptr<RosterFlight>>>		mergeRosterFlight;						  //merge时专用,<rosterId,RosterFlight列表>
	map<long long, long long> mergeNewIdToOldId;												  //merge时专用, <newRosterId,oldRosterId>

	map<string, string>                    systemParamMap;
	map<string, DBAirport*>                airportCodeMap;
    map<string, map<string, int>>		   airportDistanceMap;//机场间距离（单位：米),map<起点机场(三字码),<终点机场(三字码),距离(单位:米)>>

	//Aircraft
	map<string, shared_ptr<DBAircraft>>				fltIdToAircraftMap;

	//routeRadiationConfig
	vector<RouteRadiationConfig>		routeRadiationConfigList;

	//回调函数实例
	MandayForRosterCalculator * mandayForRosterCalculator;

	string                                 username;                                        //mantis#3111, username for 'modifyBy' field of saving data
	string                                 configDataSource;                                //DB\Server
	string                                 configDataSourceUrl;                             //server host
	void                                   compareDataCtx(std::shared_ptr<CrewDataContext> other, string otherName); //对比两个dataCtx
	std::shared_ptr<CREW_RANK>                   getCrewRankByActingRank(string crewId, time_t start, time_t end, string actingRank, string fleet = "");
	//---------------- PO START -----------------
	vector<Pairing*>                       pairingListBeforeRun;
	vector<Pairing*>                       pairingListLeadin;
	vector<Segment>                        pairingInputFlights;
	vector<Segment*>                       pairingInputFerrys;
	vector<Composition>                    compositionList;           //comp_id
	vector<CompositionLoad>              compositionLoadList;
	unordered_map<long long, composition_rank> compositionRankMap;//<compId, compRank>
	unordered_map<long long, unordered_map<int, composition_rank>> compositionRankOptionMap;//<compId, <option,compRank>> 3.0 适配多个option
	map<string, map<string, double>>        leadinOccupy;       //leadin中每个base占用的 composition占用小时总数，如某PEK的pairing配比1CA 1FO 下属一个flt blk=2h，则map<'PEK',(1+1)x2>
	vector<Pairing*>                        leadinPairings;
	map<long long, map<string, int>>             resourceCtrlIdMap;  //map<cqfId, resourceCtrl<key, value>>, in which key=dtStr + ":" + base + ":" + rank + ":" + fleet + ":" + airport
	vector<ResourceCtrlBaseBlh>            resourceCtrlBaseBlh;
	map<string, vector<int>>               dutyLimitPerDay;      //key=base, value=该base从场景第[0]天开始每一天duty上限，若场景包含法规2029则为减去该日leadin duty数之后结果
	vector<string>                          attributeNames;      //保存所有attribute名称
	vector<std::shared_ptr<Optimization_necessity>> optimizationNecessity; //保存对应航空公司的必要法规
	//---------------- PO END -----------------
	vector<std::shared_ptr<RouteActualRest>>     routeActualRestList;  //OP#1888
	vector<std::shared_ptr<Route>>               routeList;            //OP#1901
	//vector<std::shared_ptr<PairingDutyNode>>	   csvPairingDutyNodeList; 未使用
	map<long long, std::shared_ptr<RankCombinationCriteria>> rankCombinationCriteriaMap; //OP#1901
	map<long long, vector<std::shared_ptr<RankCombination>>> rankCombinationMap;
	std::unordered_map<long long, std::unordered_map<std::string, int>> rankCombIdToActingRankToNum; //8091seqOrder列组成的最大配比

	map<string, string>					   scenarioKpiMap; //优化参数

	unordered_map<long long, vector<long long>>      fltToPairingMap;      //key:flt_id, value:pairing id list, for RO only
	unordered_map<long long, Pairing*>               pairingIdMap;         //key:pairing_id, value:pairing, for RO only
	map<string, vector<Pairing*>>					 pairingLabelMap; //key:pairingLabel, value:pairing list
	vector<BASE>                           baseList;
	map<string, bool>                      overlapableAssignmentMap;
	vector<ASSIGNMENT_GROUP>               totalAssignGrps;
	vector<std::shared_ptr<ASSIGNMENT_OVERLAPPABLE>> assignmentOverlappable;
	unordered_map<string, unordered_set<string>>               assignmentNameGroupMap;
	map<string, std::shared_ptr<Briefing>>       briefingNameMap;
	atomic_llong                           tempIdGenerator;                                 //临时id生成器，
	map< string, vector<vector<time_t>> > CsvEvaCrDefaultDutyTimeMap;
	//---------------- PO HeadCount of RO Leadin-----------------
	vector<std::shared_ptr<CREW_BASE>>		   crewBases;
	vector<std::shared_ptr<ROSTER>>			   rostersForPO;
	map<long long, ATTRIBUTE>                    attributeIdMap;
	map<string, string>                    attributeNameMap;

	vector<std::shared_ptr<Voyage>>              voyageList;
	//vector<RosterPeriod>				   rosterPeriodList;
	map<long long, map<long long, shared_ptr<FatigueResult>>>	fatigueMap; //key: rosterId, value: map<dutyId, FatigueResult>

	//map<string, vector<std::shared_ptr<Teaching>>> teachingOfStudent;                             //key: student_id, value: teachings
	map<string, std::shared_ptr<Teaching>> teachingOfStudent;
	//FOR CA INT ADD BY CJ START
	map<string, map<string, int>>crewIdToFltNumToCountForCA_INT;
	map<string, int>numHistoryFlyFlightsOnCrew;
	vector<StudentsInfoForPreLockTeacher*>studentsInfoForPreLockTeacherVec;
	vector<HistoryTeachingHoursForCACCInitialTeaching*>historyTeachingHoursForCACCInitialTeachingVec;
	map<string, int>crewHasTeachingTaskInLastPeriod;
	map<string, map<string, int>>crewIdToNumEachMonthHistoryFlyPairingForCA_INT;
	map<string, map<string, double>>crewIdToEachMonthFlyHoursOnCrewForCA_INT;
	//FOR CA INT ADD BY CJ END

	//dbg ca_train start
	map<string, pair<time_t, time_t>>crewIdToStartAndEndTime;
	map<string, vector<std::shared_ptr<TeachingHistoryDetailForCACC>>> caccTeachingHistoryDetailsOfStudent;
	//dbg ca_train end

	//for cacc pairing start
	map<long long, map<long long,int>>koreaAndJapanExpatFlightToCompIdToCount;
	//for cacc pairing end
	//for ak teaching start
	map<string, map<string, pair<string, string>>> crewIdToPhaseToPeriodsForAK;
	//for ak teaching end

	// tag table data
	map<long long, vector<std::shared_ptr<TAG_FLIGHT>>> tagFlightGroupMap;
	map<long long, vector<std::shared_ptr<TAG_DUTY>>> tagDutyGroupMap;
	map<long long, vector<std::shared_ptr<TAG_PAIRING>>> tagPairingGroupMap;
	map<long long, vector<std::shared_ptr<TAG_GROUP>>> tagGroupTableMap;
	map<long long, vector<std::shared_ptr<TAG_FLIGHT_COMPOSITION>>> tagFlightCompositionGroupMap;
	map<long long, vector<std::shared_ptr<TAG_ROSTER_GROUND>>> tagRosterGroundGroupMap;
	vector<std::shared_ptr<TAG_CATEGORY>> tagCategoryList;
	map<long long, TAG *> tagGroupMap;

	vector<std::shared_ptr<TAG_SUPER_CATEGORY>> tagSuperCategoryList;
	vector<std::shared_ptr<TAG_SUPER_CATEGORY_MAP>> tagSuperCategoryMapList;

	vector<std::shared_ptr<TmTrainingConfig>> tmTrainingConfigList;
	std::shared_ptr<TmTrainingConfigIndex> tmTrainingConfigIndex;

	vector<std::shared_ptr<TmCourse>> tmCourseList;
	map<long long, std::shared_ptr<TmCourse>> tmCourseMap;//Map<Id,TmCourse>
	unordered_map<string, std::shared_ptr<TmCourse>> tmCourseCodeMap;//Map<courseCode,TmCourse>

	vector<std::shared_ptr<TmCourseBrief>> tmCourseBriefList;
	std::shared_ptr<TmCourseBriefIndex> tmCourseBriefIndex;

	vector<std::shared_ptr<TmCourseDuration>> tmCourseDurationList;
	std::shared_ptr<TmCourseDurationIndex> tmCourseDurationIndex;

	vector<std::shared_ptr<TmCourseRole>> tmCourseRoleList;
	std::shared_ptr<TmCourseRoleIndex> tmCourseRoleIndex;

	vector<std::shared_ptr<TmCourseRoleBase>> tmCourseRoleBaseList;
	std::shared_ptr<TmCourseRoleBaseIndex> tmCourseRoleBaseIndex;

	vector<std::shared_ptr<TmCourseRoleQual>> tmCourseRoleQualList;
	std::shared_ptr<TmCourseRoleQualIndex> tmCourseRoleQualIndex;

	vector<std::shared_ptr<TmCourseRoleDevice>> tmCourseRoleDeviceList;
	std::shared_ptr<TmCourseRoleDeviceIndex> tmCourseRoleDeviceIndex;

	vector<std::shared_ptr<TmFootprint>> tmFootprintList;
	std::shared_ptr<TmFootprintIndex> tmFootprintIndex;

	vector<std::shared_ptr<TmFootprintCourse>> tmFootprintCourseList;
	std::shared_ptr<TmFootprintCourseIndex> tmFootprintCourseIndex;

	vector<std::shared_ptr<TmFootprintCourseTrainee>> tmFootprintCourseTraineeList;
	std::shared_ptr<TmFootprintCourseTraineeIndex> tmFootprintCourseTraineeIndex;

	// TmFootprintCourseSectorIndex
	vector<std::shared_ptr<TmFootprintCourseSector>> tmFootprintCourseSectorList;
	std::shared_ptr<TmFootprintCourseSectorIndex> tmFootprintCourseSectorIndex;

	vector<std::shared_ptr<TmFootprintCourseIpRole>> tmFootprintCourseIpRoleList;
	std::shared_ptr<TmFootprintCourseIpRoleIndex> tmFootprintCourseIpRoleIndex;

	vector<std::shared_ptr<TmFootprintCourseIpRoleBase>> tmFootprintCourseIpRoleBaseList;
	std::shared_ptr<TmFootprintCourseIpRoleBaseIndex> tmFootprintCourseIpRoleBaseIndex;

	vector<std::shared_ptr<TmFootprintCourseIpRoleQual>> tmFootprintCourseIpRoleQualList;
	std::shared_ptr<TmFootprintCourseIpRoleQualIndex> tmFootprintCourseIpRoleQualIndex;

	vector<std::shared_ptr<TmFootprintCourseRole>> tmFootprintCourseRoleList;
	std::shared_ptr<TmFootprintCourseRoleIndex> tmFootprintCourseRoleIndex;

	vector<std::shared_ptr<TmFootprintCourseRoleQual>> tmFootprintCourseRoleQualList;
	std::shared_ptr<TmFootprintCourseRoleQualIndex> tmFootprintCourseRoleQualIndex;

	vector<std::shared_ptr<TmFootprintCourseRoleLimitation>> tmFootprintCourseRoleLimitationList;
	std::shared_ptr<TmFootprintCourseRoleLimitationIndex> tmFootprintCourseRoleLimitationIndex;

	vector<std::shared_ptr<TmProgram>> tmProgramList;
	std::shared_ptr<TmProgramIndex> tmProgramIndex;

	vector<std::shared_ptr<TmProgramBuddy>> tmProgramBuddyList;
	std::shared_ptr<TmProgramBuddyIndex> tmProgramBuddyIndex;

	vector<std::shared_ptr<TmProgramBuddyTime>> tmProgramBuddyTimeList;
	std::shared_ptr<TmProgramBuddyTimeIndex> tmProgramBuddyTimeIndex;

	vector<std::shared_ptr<TmProgramBuddyCourse>> tmProgramBuddyCourseList;
	std::shared_ptr<TmProgramBuddyCourseIndex> tmProgramBuddyCourseIndex;

	vector<std::shared_ptr<TmProgramPip>> tmProgramPipList;
	std::shared_ptr<TmProgramPipIndex> tmProgramPipIndex;

	unordered_map<long long, std::shared_ptr<TmProgramCourse>> tmProgramCourseMap;
	std::shared_ptr<TmProgramCourseIndex> tmProgramCourseIndex;

	unordered_map<long long, std::shared_ptr<TmProgramCourseInstructor>> tmProgramCourseInstructorMap;
	std::shared_ptr<TmProgramCourseInstructorIndex> tmProgramCourseInstructorIndex;

	vector<std::shared_ptr<TmProgramCourseLimitation>> tmProgramCourseLimitationList;
	std::shared_ptr<TmProgramCourseLimitationIndex> tmProgramCourseLimitationIndex;

	vector<std::shared_ptr<TmProgramCourseIpRelevance>> tmProgramCourseIpRelevanceList;
	std::shared_ptr<TmProgramCourseIpRelevanceIndex> tmProgramCourseIpRelevanceIndex;

	vector<std::shared_ptr<TmProgramCourseRole>> tmProgramCourseRoleList;
	std::shared_ptr<TmProgramCourseRoleIndex> tmProgramCourseRoleIndex;

	vector<std::shared_ptr<TmProgramCourseRoleQual>> tmProgramCourseRoleQualList;
	std::shared_ptr<TmProgramCourseRoleQualIndex> tmProgramCourseRoleQualIndex;

	vector<std::shared_ptr<TmProgramCourseRoleLimitation>> tmProgramCourseRoleLimitationList;
	std::shared_ptr<TmProgramCourseRoleLimitationIndex> tmProgramCourseRoleLimitationIndex;

	vector<std::shared_ptr<TmProgramCourseIpRole>> tmProgramCourseIpRoleList;
	std::shared_ptr<TmProgramCourseIpRoleIndex> tmProgramCourseIpRoleIndex;

	vector<std::shared_ptr<TmProgramCourseIpRoleBase>> tmProgramCourseIpRoleBaseList;
	std::shared_ptr<TmProgramCourseIpRoleBaseIndex> tmProgramCourseIpRoleBaseIndex;

	vector<std::shared_ptr<TmProgramCourseIpRoleQual>> tmProgramCourseIpRoleQualList;
	std::shared_ptr<TmProgramCourseIpRoleQualIndex> tmProgramCourseIpRoleQualIndex;

	vector<std::shared_ptr<TmProgramCoursePnr>> tmProgramCoursePnrList;
	std::shared_ptr<TmProgramCoursePnrIndex> tmProgramCoursePnrIndex;

	vector<std::shared_ptr<TmProgramCourseIpck>> tmProgramCourseIpckList;
	std::shared_ptr<TmProgramCourseIpckIndex> tmProgramCourseIpckIndex;

	vector<std::shared_ptr<TmProgramCourseMore>> tmProgramCourseMoreList;
	std::shared_ptr<TmProgramCourseMoreIndex> tmProgramCourseMoreIndex;

	vector<std::shared_ptr<TmProgramCourseMoreLeg>> tmProgramCourseMoreLegList;
	std::shared_ptr<TmProgramCourseMoreLegIndex> tmProgramCourseMoreLegIndex;

	vector<std::shared_ptr<TmDevice>> tmDeviceList;
	map<string, std::shared_ptr<TmDevice>> tmDeviceMap;//Map<resourceCode,TmDevice>

	vector<std::shared_ptr<TmDeviceTime>> tmDeviceTimeList;
	std::shared_ptr<TmDeviceTimeIndex> tmDeviceTimeIndex;

	vector<std::shared_ptr<TmPairingChart>> tmPairingChartList;
	std::shared_ptr<TmPairingChartIndex> tmPairingChartIndex;

	vector<std::shared_ptr<TmPairingChartRole>> tmPairingChartRoleList;
	std::shared_ptr<TmPairingChartRoleIndex> tmPairingChartRoleIndex;

	vector<std::shared_ptr<TmPairingChartRoleQual>> tmPairingChartRoleQualList;
	std::shared_ptr<TmPairingChartRoleQualIndex> tmPairingChartRoleQualIndex;

	vector<std::shared_ptr<TmPairingChartCourse>> tmPairingChartCourseList;
	std::shared_ptr<TmPairingChartCourseIndex> tmPairingChartCourseIndex;


	vector<std::shared_ptr<DEPARTMENT_GROUP>> departmentGroupList;
	vector<std::shared_ptr<HISTORY_CREW_STATISTICS>> historyCrewStatisticsList;
	std::unordered_map<string, std::shared_ptr<HISTORY_CREW_STATISTICS>> historyCrewStatisticsMap;
	vector<std::shared_ptr<HISTORY_DEPARTMENT_STATISTICS>> historyDepartmentStatisticsList;
    vector<std::shared_ptr<PORT_LO_STATISTICS>> portLayoverStatisticsList;
	vector<std::shared_ptr<CrewMonthManday>> crewMonthMandayList;

	vector<std::shared_ptr<CrewRpRecency>> crewRpRecencyList;

	std::shared_ptr<CrewRpRecencyIndex> crewRpRecencyIndex;

	std::vector<csvActivityComposition> originalFlightComposition;

	std::vector<std::shared_ptr<DutyCodeLogic>> dutyCodeLogicList;
    unordered_map<long long, std::vector<std::shared_ptr<DutyCodeLogic>>> dutyCodeLogicMap; // key:dutyCodeTypeCompId, value:dutyCodeLogic list

	std::vector<std::shared_ptr<DutyCodeTypeComp>> dutyCodeTypeCompList;

	string getApplicationType() { return applicationType; }

	std::map<long long, std::string> flightPICMap; // 记录航班的pic人员

	// rule function map
	const vector<DBRule>& getRuleFunctions(const int func) const {
		auto it = _ruleFuncMap.find(func);
		if (it != _ruleFuncMap.end())
			return it->second;
		return _emptyFunc;
	}
	void addRuleFunction(const int func, const DBRule item) {
		_ruleFuncList.emplace(func);
		auto it = _ruleFuncMap.find(func);
		if (it == _ruleFuncMap.end())
			_ruleFuncMap.insert(make_pair(func, vector<DBRule>(1, item)));
		else
			it->second.push_back(item);
	}
	CalculationManday getCalculationManday(const string& key) const {
		auto it = _calculationMandayMap.find(key);
		if (it != _calculationMandayMap.end())
			return it->second;
		return CalculationManday();
	}
	void addCalculationManday(const string& key, CalculationManday manday) { _calculationMandayMap[key] = manday; }

	void clearRuleList();

	set<int>& getRuleFuncList();

	//获得指定discretionType（FDP、FT、Rest、DP、Sector）的时长（分钟数）
	int getManualDiscretion(const std::string& discretionType);

	//判断客户端是否是Live场景，true-表示Live，false-表示Scenario
	bool isLiveMode() const;

	//获得每周开始星期几
	string getWeekdayStartFrom();

	std::string getSystemParamValue(const std::string& paramName, const std::string defaultValue = "") const;

	//针对法规服务化申请请求操作Pairing、Roster等时间，来修订场景开始时间和结束时间
	void reviseScenarioStartAndEndTime(const vector<std::shared_ptr<Activity>>& itemList);

	bool Is8091AlwaysResetSeqOrder() const {
		return _is8091AlwaysResetSeqOrder;
	}

	void setIs8091AlwaysResetSeqOrder(const bool value) {
		_is8091AlwaysResetSeqOrder = value;
	}

	bool isRequestScope() const {
		return _isRequestScope;
	}

	void setIsRequestScope(const bool value) {
		_isRequestScope = value;
	}

	const string& getRequestTransactionId() const;

	void setRequestTransactionId(const string value);

	const string& getRequestTransactionStatus() const;

	void setRequestTransactionStatus(const string value);

	const std::size_t getRequestTransactionCount() const;

	bool isServiceMode() const {
		return _isServiceMode;
	}

	void setIsServiceMode(const bool value) {
		_isServiceMode = value;
	}


	vector<SharedPtr<RULE_VIOLATION>>& getPrepareCheckRuleViolations();

	RequestRoster& getRequestRoster();

	inline const std::unordered_map<std::string, RDOParamCache>& GetRDOParamCacheMap() {
		return _crewIdToRDOParamCache;
	}

	inline void clearRDOParamCacheMap() {
		_crewIdToRDOParamCache.clear();
	}

	inline void setRDOParamCacheMap(const std::string& crewId, const RDOParamCache& rdoParamCache) {
		_crewIdToRDOParamCache[crewId] = rdoParamCache;
	}

	inline const std::unordered_map<std::string, EnumerationDayOffPatternHelperParamCache>& GetDOParamCacheMap() {
		return _crewIdToDoParamCache;
	}

	inline void clearDOParamCacheMap() {
		_crewIdToDoParamCache.clear();
	}

	inline void setDOParamCacheMap(const std::string& crewId, const EnumerationDayOffPatternHelperParamCache& doParamCache) {
		_crewIdToDoParamCache[crewId] = doParamCache;
	}

	inline bool IsNeedPreAssignCache() const { return _needPreAssignCache; }

	inline void setNeedPreAssignCache(const bool value) { _needPreAssignCache = value; }

	inline Helper6001Cache& GetHelper6001Cache() {
		return _helper6001Cache;
	}

	inline std::shared_ptr<DataError>& GetDataError() {
		return _dataError;
	}

	const DutyCode::DutyCodeAssignment* GetDutyCodeAssignment() const { return _dutyCodeAssignment.get(); }

	//获得二个机场之间的距离，单位：米。未找到返回-1
	int getDistanceBetweenAirports(const string& depStation, const string& arrStation) const;

    std::vector<std::shared_ptr<BiddingSequenceGroup>> bidSequenceGroups;
    std::vector<std::shared_ptr<BiddingResult>> biddingResults;

    std::unique_ptr<DBTrainingDataHolder> dbTrainingDataHolder;//TO使用

	bool IsSupportRulePhaseConfig();
public:
	//多航司支持
	vector<Pairing*> getPairingList(const string& filiale = "", const string& division = "") const;
	vector<std::shared_ptr<CREW>> getCrewList(const string& filiale = "", const string& division = "") const;

	long long getRuleSetIdByLiveConfig(const string& filiale, const string& division, const string& module = "TRACKING") const;
	vector<DBRule> getRuleListByLiveConfig(const string& filiale, const string& division, const string& module = "TRACKING") const;
private:
	map<string, vector<string>>            indexRule8014DutyGrp;                            //rule=8014 数据索引
	map<int, vector<DBRule>> _ruleFuncMap; //为保证线程安全，不暴露为public
	vector<DBRule> _emptyFunc;
	set<int> _ruleFuncList; //法规规则ID列表

	map<string, CalculationManday>         _calculationMandayMap; //key:type, value:item, eg: key=BH, value={START=Sch, END=Act}

	string                                 applicationType;                                 //OR, RuleSrv
	bool                                   configInputLog = true;                                  //default=true, 是否记录input log: ro_input_rules.txt/ ro_input_pairing.txt ...
	//PairingDBContext                       *dbCtx;
	string                                 httpAuthToken;
	//CsvEvaCrDefaultDutyTime

	bool _is8091AlwaysResetSeqOrder{ false };
	bool _isRequestScope{ false }; //判断操作是否仅作用于当前请求
	bool _isServiceMode{ false }; //判断是否以法规服务化模式运行
	std::string _requestTransactionId; //请求事务ID
	std::string _requestTransactionStatus; //请求事务状态
	std::size_t _requestTransactionCount = 0; //当前事务ID被请求的次数

	std::string _defaultComposition{}; //默认配比

	mutable int _mainBaseOffsetTZMinutes{ -1 }; //主基地时区

	shared_ptr<bool> _isSupportRulePhaseConfig;

	std::shared_ptr<DataError> _dataError =  nullptr;

	//针对法规服务化申请请求操作减少crew的roster和manday的数量。必须在reviseScenarioStartAndEndTime()方法之后
	void reviseCrewRosterAndManday();

	//针对法规服务化申请请求操作减少crew的roster和manday的数量
	void reviseCrewRosterAndManday(SharedPtr<CREW>& crew);

	void makeDictionaryMap();

	void makeAirportDistanceMap();

	vector<std::shared_ptr<Dictionary>> getDictionaryChildList(const std::string& parentCode, const vector<std::shared_ptr<Dictionary>>& allDictionaryList, const bool isLoadChild = true);

	//获得二个机场之间的距离，单位：米。未找到返回-1
	int getDistanceBetweenAirportsImpl(const string& depStation, const string& arrStation) const;

	// SQ Duty Code Assignment
	void initDutyCodeAssignment();
	std::unique_ptr<DutyCode::DutyCodeAssignment> _dutyCodeAssignment;

	// 6001 Enumeration Helper Cache
	Helper6001Cache _helper6001Cache;

	// 6001 RDO param Cache
	bool _needPreAssignCache = true;
	std::unordered_map<std::string, RDOParamCache> _crewIdToRDOParamCache;
	std::unordered_map<std::string, EnumerationDayOffPatternHelperParamCache> _crewIdToDoParamCache;

	//法规服务化事务临时保存的crewIdMap
	map<string, std::tuple<vector<SharedPtr<ROSTER>>, vector<SharedPtr<CREW_MANDAY_FD>>, vector<SharedPtr<CREW_MANDAY_CC_AM>>>> _transactionCrewIdMap;


	vector<SharedPtr<RULE_VIOLATION>> _prepareRuleViolations;

	RequestRoster _requestRoster;

	//更新变更的静态数据（包括新增和修改）
	static void updateChangedBaseData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData);

	//移除删除的静态数据
	static void deleteChangedBaseData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData);

	//全量更新所有静态数据
	static void updateAllBaseData(const shared_ptr<CrewDataContext>& srcDbData, const shared_ptr<CrewDataContext>& destDbData);

};


//-------------- 接口函数 --------------
//数据源配置
struct DATA_SOURCE_CONFIG{
	enum data_source_type {FILE, COMMAND_LINE_ARG};
	data_source_type configBy = FILE;
	string dataSourceType;
	string url;
	string user;
	string password;
	static DATA_SOURCE_CONFIG& getInstance();
};
int                                   loadDatabaseConnectionConfig(DATA_SOURCE_CONFIG& config);
int                                   loadRuleSrvConfig    (DATA_SOURCE_CONFIG& config);

//-- 写操作：roster是否合法: 违反的rule
//-- 来源：是否来自RO engine调用、手工操作模块、定时检查
//         crewList, rosterList, ruleList,
//
//-- 参数：直接给当前操作目标对象集合的vector，如当前对哪些crew检查法规
//-- 索引：crew -> rank/fleet/qualification



//从CQF列表提取 Special Port Resource Ctrl
//参数function应为以下定义之一
#define                               CQF_FUNC_BASE_RES_CTRL                4001  //base head count/blh
#define                               CQF_FUNC_AUG_RES_CTRL                 4005  //Augment Resource Control
#define                               CQF_FUNC_EXPAT_RES_CTRL               4006  //Expat Resource Control
#define                               CQF_FUNC_ICAO_RES_CTRL                4007  //ICAO Resource Control
#define                               CQF_FUNC_PORT_RES_CTRL                4008  //Special Port Resource Control
#define                               CQF_FUNC_Restricted_Crew              4009  //Restricted Crew in Roster Optimization

#define                               CQF_FUNC_ROSTER_FAIRNESS              6001  //Roster fairness
#define                               CQF_FUNC_ROSTER_FAIRNESS_COMPONENT    6002  //Roster fairness
#define								  CQF_FUNC_ROSTER_STATISTICS            6010  //Calculate the statistics
#define                               CQF_FUNC_BLANK_DAY_FILLING_Config     6003  //Configuration in blank day filling process
#define                               CQF_FUNC_COBASE_CONNECTION_Config     6004  //Configuration of CoBase connection (EVA only)
#define                               CQF_FUNC_CONFIGURABLE_COMPARATOR     	6005  //configurable comparator scripts

//get time from 1970-1-1 08:00 in seconds
time_t        makeUTC       (int year, int mon, int day, int hour, int min, int sec);
//void          db_err_handler(OCI_Error *err);

#endif
//PAIRING_DB_H
