#ifndef CSV_IMP_H
#define CSV_IMP_H
/*
crew csv reader实现：
Crew
Roster
Pairing
PairingDuty
PairingSegment
Flight
FlightComposition
FlightAttribute
AssignmentGroup
Assignment
Airport
Base
Composition
RankActing
Holiday
SystemParameter
*/
#include <iostream>
#include <chrono>
#include <vector>
#include <set>
#include "csv_reader.h"

//***********************************
// data class
//***********************************
struct csvWorkset {
	long long id = 0;
	string name;
	string type;
	string category;
	string division;
	string filiale;
};
struct csvCity {
	string city;
	string cityName;
	string cityNativeName;
	string cityDesc;
	string country;
};
struct csvCrewFlyTogether {
	long long id = 0;
	string crewIdA;
	string crewIdB;
	string flyTogetherIndicator;
	string reason;
	time_t effectiveDate = 0;
	time_t expiryDate = 0;
	string restrictionType;
	vector<string> restrictionTypeList;

	// todo: parse the below fields
	std::vector<std::string> airports;
	std::vector<std::string> attributes;
};
struct CsvEvaCrDefaultDutyTime{
	long long id = 0;
	string ddtAssignmentUnitQualifier;
	string ddtAssignmentUnitType;
	string ddtBaseAirportCode;
	int ddtDefaultDurationMins = 0;
	string ddtDefaultLocalStrTime;
	time_t defaultLocalStrDt = 0;
	time_t defaultLocalEndDt = 0;
	int ddtRestTime = 0;
};
//struct csvFlightAttr {
//	long long fltId;
//	int attrId;
//};
struct csvRankValue {
	long long activityId = 0;
	string rank;
	int value = 0;
};
struct csvImblanceFlight {
	long long scenarioId = 0;
	long long flightId = 0;
	string user;
	time_t tmst = 0;
};

struct csvFlightBlhHistory {
	long long id = 0;
	string airline;
	string fleet;
	string depArp;
	string arvArp;
	int blkMin = 0;
};
struct csvFlightAttribute {
	long long id = 0;
	long long fltId = 0;
	long long schId = 0;
	long long attrId = 0;
};
struct csvCommuteSchedule {
	long long id = 0;
	long long worksetId = 0;
	string airline;
	time_t effDt = -1;
	time_t expDt = -1;
	string dow;
	string commuteType;
	string commuteNum;
	string depSta;
	int depTm = 0;
	string arvSta;
	int arvTm = 0;
	int durationMin = 0;
	string flightFlag;
	string flightAssignment;
	string fleet;
	string status;
	string division;
};
struct csvOptimizationNecessity {
	long long id = 0;
	string airline;
	string category;
	string division;
	string componentType;
	int function = 0;
	string name;
	string necessity;//'M'-Mandatory or 'O'-Optional
};

struct csvCrewOnFlight {
	long long fltId = 0;
	long long pairingId = 0;//for COP
	int seqOrder = 0;
	string crewId;
	string actingRank;
	string assignment;
	string role;
	string subRole;
	string pairingPrimeActivity;//for COP
	string source;

	long long dutyId = 0;
	long long rosterId = 0;
	std::string fltDt;
	string division;
	string activeRank;
	string position;
	string checkType;
	string tsFlag;
	std::set<string> tsFlags;

	//training Manage 训练
	string resourceCode; //training课室
	string groupId;//training分组
	long long tmProgramCourseId = 0;//training课程
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
};

struct csvActivityComposition {
	long long id = 0;
	long long scenarioId = 0;
	long long activityId = 0; // flt_id/ pairing_id
	long long compId = 0;
	short multipler = 0;
	char division = '\0'; //value:C,P,A
	string actingRank;
	int planValue = 0;
	long long pairingScenarioId = 0;
}; 
struct csvComposition {
	long long compId = 0;
	string airline;
	string name;
	string nameDesc;
	string division;
	int displayOrder = 0;
	int hirarchy = 0;
};
struct csvCompositionRank {
	long long id = 0;
	long long compId = 0;
	long long rankId = 0;
	int planValue = 0;
	int planValueExtra = 0;
	int option = 0;
};
struct csvSystemParam {
	string parmName;
	string parmValue;
	string parmSeparator;
	string idapp;
	string parmDesc;
};
struct csvRankActing {
	//id,rankId,actingRank,qual
	long long id = 0;
	string airline;
	string activeRank;
	string actingRank;
	string qual;
};

struct csvAttribute {
	long long id = 0;
	string airline;
	string code;
	string type;
	string name;
	string operation;
	string source;
	bool isVisible = true;
};
//struct csvTagCategory {
//	long long id = 0;
//	string code;
//	string name;
//	int ratio;
//	int idx;
//};
//struct csvTagGroup {
//	long long id = 0;
//	long long tagCategoryId;
//	long long parentId;
//	string tableType;
//	string type;
//	string condition;
//	int level;
//	int idx;
//};
//struct csvTagFlight {
//	long long id = 0;
//	long long tagGroupId;
//	time_t fltDtStart;
//	time_t fltDtEnd;
//	string fltNum;
//	string fleet;
//	string dir;
//	string depArp;
//	string arvArp;
//	string stdStart;
//	string stdEnd;
//	string staStart;
//	string staEnd;
//};
//struct csvTagDuty{
//	long long id = 0;
//	long long tagGroupId;
//	string checkInStart;
//	string checkInEnd;
//	string checkOutStart;
//	string checkOutEnd;
//	string blhStart;
//	string blhEnd;
//	string fdpStart;
//	string fdpEnd;
//	string segNum;
//};
//struct csvTagPairing {
//	long long id = 0;
//	long long tagGroupId;
//	string base;
//	string pairingLength;
//	string avgBlhLow;
//	string avgBlhHigh;
//	string layover;
//};
struct csvRuleParam {
	long long id = 0;
	long long ruleId = 0;
	long long phaseId = 0;
	string paramNames;
	string paramValues;
};
struct ASSIGNMENT_GROUP_MAP {
	long long      assignGrpId = 0;
	long long      assignId = 0;
};
struct ASSIGNMENT_GROUP_NAME_MAP {
	string   grpName;
	string   name;
};

#define declareParser \
public:\
	string toCsv(vector<string>& headers, void* obj);\
	void fromCsv(vector<string>& headers, int index, char* value, void* obj);\
	void* createInstance();\
	void deleteInstance(void* obj);\
	vector<string>& getDefaultHeaders();\
	void init(vector<string>& headers);

class liveConfigParser : public csvParser {
	declareParser;
};
class ruleSetParser : public csvParser {
	declareParser;
};
class ruleParser : public csvParser {
	declareParser;
};
class ruleParamParser : public csvParser {
	declareParser;
};
class cqfParser : public csvParser {
	declareParser;
};
class cqfParamParser : public csvParser {
	declareParser;
};
//***********************************
// csv parser implements
//***********************************
class optimizationNecessityParser : public csvParser {
	declareParser;
};

class commuteScheduleParser : public csvParser {
	declareParser;
};

class flightBlhHistoryParser : public csvParser {
	declareParser;
};
class imbalanceFlightParser : public csvParser {
	declareParser;
};
class flightParser : public csvParser {
	declareParser;
};

class flightCompositionParser : public csvParser {
	declareParser;
};
class flightAttributeParser : public csvParser {
	declareParser;
};

class Segment; // forward declaration
class segmentParser : public csvParser {
	declareParser;
    static void calculateLongTransitWithinDuty(Segment* first, Segment* second);
};

class dutyParser : public csvParser {
	declareParser;
};

class pairingParser : public csvParser {
	declareParser;
	map<long long, string> pairingPreferenceMap;
};
class pairingCompositionParser : public csvParser {
	declareParser;
};

class rosterParser : public csvParser {
	declareParser;
};

class rosterGroundParser : public csvParser {
	declareParser;
};

typedef void(*funcCsvSetter)(char*, void*);
class mandayCcAmParser : public csvParser {
	declareParser;
	map<string, funcCsvSetter> headerSetters;
};
class mandayFdParser : public csvParser {
	declareParser;
};

class crewMonthMandayParser : public csvParser {
    declareParser;
};
class crewParser : public csvParser {
	declareParser;
}; 
class crewLastPublishDateParser : public csvParser {
	declareParser;
};
class crewRankParser : public csvParser {
	declareParser;
};
class crewCompanyRankParser : public csvParser {
	declareParser;
};
class crewBaseParser : public csvParser {
	declareParser;
};
class crewFleetParser : public csvParser {
	declareParser;
};
class crewQualificationParser : public csvParser {
	declareParser;
};
class crewPreferenceParser : public csvParser {
	declareParser;
};
class crewStatusParser : public csvParser {
	declareParser;
};
class crewTeamParser : public csvParser {
	declareParser;
};
class crewEntitlementParser : public csvParser {
	declareParser;
};
class crewFirstDutyInfoParser : public csvParser {
	declareParser;
};
class crewProfileParser : public csvParser {
	declareParser;
};
class crewGuaranteeHourParser : public csvParser {
	declareParser;
};
class crewKpiAdjustParser : public csvParser {
	declareParser;
};
class crewRpRecencyParser : public csvParser {
	declareParser;
};
class crewSeniorityParser : public csvParser {
	declareParser;
};
class attributeParser : public csvParser {
	declareParser;
};
class fleetParser : public csvParser {
	declareParser;
};
class qualificationParser : public csvParser {
	declareParser;
};
class fatigueResultParser : public csvParser{
	declareParser;
};
class dictionaryParser : public csvParser {
	declareParser;
};
class rankParser : public csvParser {
	declareParser;
};
class rankPositionParser : public csvParser {
	declareParser;
};
class rosterPeriodParser : public csvParser {
	declareParser;
};
class compositionParser : public csvParser {
	declareParser;
};
class compositionRankParser : public csvParser {
	declareParser;
};

class cityParser : public csvParser {
	declareParser;
};

class crewFlyTogetherParser : public csvParser {
	declareParser;
};

class crewFlyPreferenceParser : public csvParser {
	declareParser;
};

class airportParser : public csvParser {
	declareParser;
};

class briefingParser : public csvParser {
	declareParser;
};

class baseParser : public csvParser {
	declareParser;
};
class rankActingParser : public csvParser {
	declareParser;
};

class assignmentGroupParser : public csvParser {
	declareParser;
};
class assignmentParser : public csvParser {
	declareParser;
};
class assignmentGroupMapParser : public csvParser {
	declareParser;
};
class assignmentOverlappableParser : public csvParser {
	declareParser;
};

class portQualReqmntParser : public csvParser {
	declareParser;
};

class portLOStatisticsParser : public csvParser {
	declareParser;
};

class crewOnFlightParser : public csvParser {
	declareParser;
};

class holidayParser : public csvParser {
	declareParser;
};

class sysParamParser : public csvParser {
	declareParser;
};

class subFleetParser : public csvParser {
	declareParser;
};

class scenarioParser : public csvParser {
	declareParser;
};
class scenarioKpiParser : public csvParser {
	declareParser;
};
class worksetParser : public csvParser {
	declareParser;
};

class rankValueParser : public csvParser {
	declareParser;
};

class recencyParser : public csvParser {
	declareParser;
};

class recencyRulesParser : public csvParser {
	declareParser;
};

class fleetRecencyParser : public csvParser {
	declareParser;
};

class portRecencyParser : public csvParser {
	declareParser;
};

class qualExtensionConfigParser : public csvParser {
	declareParser;
};

class stringParser : public csvParser {
	declareParser;
};

class calculationMandayParser : public csvParser {
	declareParser;
};

class routeActualRestParser : public csvParser {
	declareParser;
};

class routeParser : public csvParser {
	declareParser;
};

class routeRaditionConfigParser : public csvParser {
	declareParser;
};
//class rosterPeriodParser : public csvParser {
//	declareParser;
//};

class rankCombinationCriteriaParser : public csvParser {
	declareParser;
};
class rankCombinationParser : public csvParser {
	declareParser;
};

class defaultParser : public csvParser {
	declareParser;
};
class teamParser : public csvParser {
	declareParser;
};
class csvEvaCrDefaultDutyTimeParser : public csvParser {
	declareParser;
};
class aircraftParser : public csvParser {
	declareParser;
};
class tagCategoryParser : public csvParser {
	declareParser;
};
class tagGroupParser : public csvParser {
	declareParser;
};
class tagFlightParser : public csvParser {
	declareParser;
};
class tagFlightCompositionParser : public csvParser {
	declareParser;
};
class tagDutyParser : public csvParser {
	declareParser;
};
class tagRosterGroundParser : public csvParser {
	declareParser;
};
class tagPairingParser : public csvParser {
	declareParser;
};
class tagSuperCategoryParser : public csvParser {
	declareParser;
};
class tagSuperCategoryMapParser : public csvParser {
	declareParser;
};
class departmentGroupParser : public csvParser {
	declareParser;
};
class historyCrewStatisticsParser : public csvParser {
	declareParser;
};
class historyDepartmentStatisticsParser : public csvParser {
	declareParser;
};
class crewRequestDetailParser : public csvParser {
	declareParser;
};
class crewRequestRecordParser : public csvParser {
    declareParser;
};
class crewRequestRecordDetailParser : public csvParser {
    declareParser;
};
class voyageParser : public csvParser {
	declareParser;
};
class voyageDetailParser : public csvParser {
	declareParser;
};
class teachingParser : public csvParser {
	declareParser;
};
class teachingDetailParser : public csvParser {
	declareParser;
};
class teachingHistoryDetailForCACCParser : public csvParser {
	declareParser;
};
class tmTrainingConfigParser : public csvParser {
	declareParser;
};
class tmCourseParser : public csvParser {
	declareParser;
};
class tmCourseBriefParser : public csvParser {
	declareParser;
};
class tmCourseDurationParser : public csvParser {
	declareParser;
};
class tmCourseRoleParser : public csvParser {
	declareParser;
};
class tmCourseRoleBaseParser : public csvParser {
	declareParser;
};
class tmCourseRoleQualParser : public csvParser {
	declareParser;
};
class tmCourseRoleDeviceParser : public csvParser {
	declareParser;
};
class tmFootprintParser : public csvParser {
	declareParser;
};
class tmFootprintCourseParser : public csvParser {
	declareParser;
};
class tmFootprintCourseTraineeParser : public csvParser {
	declareParser;
};
class tmFootprintCourseSectorParser : public csvParser {
	declareParser;
};
class tmFootprintCourseIpRoleParser : public csvParser {
	declareParser;
};
class tmFootprintCourseIpRoleBaseParser : public csvParser {
	declareParser;
};
class tmFootprintCourseIpRoleQualParser : public csvParser {
	declareParser;
};
class tmFootprintCourseRoleParser : public csvParser {
	declareParser;
};
class tmFootprintCourseRoleQualParser : public csvParser {
	declareParser;
};
class tmFootprintCourseRoleLimitationParser : public csvParser {
	declareParser;
};
class tmProgramParser : public csvParser {
	declareParser;
};
class tmProgramBuddyParser : public csvParser {
	declareParser;
};
class tmProgramBuddyTimeParser : public csvParser {
	declareParser;
};
class tmProgramBuddyCourseParser : public csvParser {
	declareParser;
};
class tmProgramPipParser : public csvParser {
	declareParser;
};
class tmProgramCourseParser : public csvParser {
	declareParser;
};
class tmProgramCourseInstructorParser : public csvParser {
	declareParser;
};
class tmProgramCourseLimitationParser : public csvParser {
	declareParser;
};
class tmProgramCourseIpRelevanceParser : public csvParser {
	declareParser;
};
class tmProgramCourseRoleParser : public csvParser {
	declareParser;
};
class tmProgramCourseRoleQualParser : public csvParser {
	declareParser;
};
class tmProgramCourseRoleLimitationParser : public csvParser {
	declareParser;
};
class tmProgramCourseIpRoleParser : public csvParser {
	declareParser;
};
class tmProgramCourseIpRoleBaseParser : public csvParser {
	declareParser;
};
class tmProgramCourseIpRoleQualParser : public csvParser {
	declareParser;
};
class tmProgramCoursePnrParser : public csvParser {
	declareParser;
};
class tmProgramCourseIpckParser : public csvParser {
	declareParser;
};
class tmProgramCourseMoreParser : public csvParser {
	declareParser;
};
class tmProgramCourseMoreLegParser : public csvParser {
	declareParser;
};
class tmDeviceParser : public csvParser {
	declareParser;
};
class tmDeviceTimeParser : public csvParser {
	declareParser;
};
class tmPairingChartParser : public csvParser {
	declareParser;
};
class tmPairingChartRoleParser : public csvParser {
	declareParser;
};
class tmPairingChartRoleQualParser : public csvParser {
	declareParser;
};
class tmPairingChartCourseParser : public csvParser {
	declareParser;
};
class rosterFlightParser : public csvParser {
	declareParser;
};
class pairingDutyNodeParser :public csvParser{
	declareParser;
};
class guaranteeFlyHoursParser :public csvParser {
	declareParser;
};
// bidding相关数据表
class bidParser : public csvParser {
    declareParser;
};
class bidRequirementParser : public csvParser {
    declareParser;
};
class bidRequirementDetailParser : public csvParser {
    declareParser;
};
class biddingSequenceParser : public csvParser {
    declareParser;
};
class biddingSequenceGroupParser : public csvParser {
declareParser;
};
class biddingResultParser : public csvParser {
    declareParser;
};
class biddingResultDetailParser : public csvParser {
    declareParser;
};

class dutyCodeLogicParser : public csvParser {
	declareParser;
};

class dutyCodeTypeCompParser : public csvParser {
	declareParser;
};

class compositionLoadParser : public csvParser {
	declareParser;
};

class crewCsvReader : public csvReader {
public:
	crewCsvReader();
	shared_ptr<csvParser> getParser(string tableName);
	string getParserName(string tableName);
	int getVersion();
};
class pairingChangeRecordParser : public csvParser {
	declareParser;
};
class programCourseParticipantParser : public csvParser {
	declareParser;
};
class programCourseInstructorParticipantParser : public csvParser {
declareParser;
};
class rulePhaseConfigParser : public csvParser {
	declareParser;
};
extern long long split_cost;///TEST

#endif//CSV_IMP_H