
#ifndef RULE_PARAMETERS_H
#define RULE_PARAMETERS_H

#include "CrewDB.h"
#include "Utility.h"
#include "ThreadLocal/ThreadLocal.h"

int retriveRuleParameter(const map<string, string>& params, string paramName, string& paramValue, bool allowEmpty, bool mustNumber);

struct long_transit
{
	string airport;
	string division;
	string inbound;
	string outbound;
	string in_assignment="*";
	string out_assignment="*";
	int maxTurnTimeMins=60*24*5;
	int maxTurnTimeUpperMins = -1;
	bool hasMaxTurnTimeRange = false;
	int pseudoCI = 30;//虚拟签到
	int pseudoCO = 30;//虚拟签出
	int pseudoPickup = 0;//虚拟Pickup
	int pseudoDropoff = 0;//虚拟Dropoff
	bool isSplitDuty = true; //是否Split Duty
	vector<string> fleetsVec;
};

struct max_fdp_after_delay_definition {
	//航班总延误时间(分钟数),格式：HH:mm-HH:mm
	string totalFlightDelay{""};
	int totalFlightDelayMinutesLower{0};
	int totalFlightDelayMinutesUpper{ 0 };

	//延误发生在reporting time之前多长时间范围才符合条件
	string amountOfNotificationRanges;
	int amountOfNotificationMinutesLower{0};
	int amountOfNotificationMinutesUpper{INT_MAX};

	//采用修正或原FDP开始时间，支持*忽略该参数。
	//取值：R/O/RO。若是R，则表示采用修正FDP开始时间，O - 则采用原FDP开始时间, RO-原Reporting time 和 延迟Reporting Time 分别 计算Max FDP, 取最小的Max FDP
	string revisedOrOriginalFDPStartTime;

	//FDP开始时间差值(分钟数)，支持*忽略该参数。
	//格式：HH:MM。	若是revisedOrOriginalFDPStartTime为O，则FDP开始时间使用原FDP开始时间 + HH:MM
	string fdpStartTimeDelta;
	int fdpStartTimeDeltaMinutes = 0;

	//是否使用计划起飞时间。取值：Y/N，支持*忽略该参数。若是Y，则表示采用航班计划起飞时间STD，N-则采用航班ETD或ATD
	std::shared_ptr<bool> isSTD{ nullptr };

};

//class __declspec(dllexport) RuleParams
class RuleParams
{
public:
	/*Default logic to calculate FDP*/
	bool bPickupCount = false, bDropoffCount = false, bPreFerryCount = true, bIncludeCI=true;
	bool bAugAllowed = false, bIncludeCO = false, bIncludeLastDHD = false;
	bool bIncludePreSBY = false, bIncludePostSBY = false, bIncludePreGround = false, bIncludePostGround = false, bIncludePreStay = false, bIncludePostStay = false, bIncludePreHSB = false, bIncludePostHSB = false;
	bool bIncludeLongTransitCO = true;//mantis#8766, 长中转FDP需计算debrief，为与duty brief区分单独设置参数
	bool bIncludeLongTransitCI = true;
	bool bIncludeLongTransitPickup = true;
	bool bIncludeLongTransitDropoff = true;
	bool bIncludeLongTransitBreak = false;
	bool bUseStickTime = false;
	//在FDP原先基础上固定加iFixedValueToFDP（分钟）
	//FDP向后扩展
	int  iFixedValueToFDP = 0;
	//FDP向前扩展
	int beforeFixValueToFDP = 0;
	int  postActivityThreshold = 0;
	int  minConnectionTimeMinutes = 0;

	string basicComposition="2P";
	long long basicCompositionId = -1;

	int delayMinutes = 15;

	vector< long_transit*> split_duty;
	map<string, int> rest_bunk;
	// 静态成员函数,提供全局访问的接口
	static RuleParams* GetInstancePtr();
	static void setDivision(const string& division);
	static constexpr const char* DUTY_BRIEF_FIELD = "BRIEF TIME";
	static constexpr const char* DUTY_MAX_FDP_BRIEF_FIELD = "MAX FDP BRIEF";
	static int CalculateDutyBrief(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, const string& pairingBase = "", const string& briefField = DUTY_BRIEF_FIELD);
	// When rule 3021 Max FDP Brief is configured (not *), returns Brief Time - Max FDP Brief in minutes; otherwise 0.
	static int GetMaxFdpBriefDeltaMinutes(const Duty* duty, const SharedPtr<CrewDataContext>& dbData, const string& pairingBase = "");
	static void ApplyMaxFdpBriefDeltaToDuty(Duty* duty, const SharedPtr<CrewDataContext>& dbData, const string& pairingBase = "");

	
	void loadRuleParams(SharedPtr<CrewDataContext> _data);
	void loadAssignments(vector<SharedPtr<DBRule_8014>> assignments, string airlinecode);
	int  GetFDP_CO();

	int  GetFDP_LAST_DHD();

	int  GetFDPMode();

	map<string, int>* getProbations();
	bool isUseHistoryBlock();
	vector<string>* getRestAssignments();
	vector<string>* getStandbyAssignments();
	bool isRestAssignment(const string& assignment, const string& assignmentGroup);
	Local_Night_Definition& getLocalNightDefinition();
	WOCL_Definition& getWOCLDefinition();
	Early_Start_Definition& getEarlyStartDefinition();
	Late_Finish_Definition& getLateFinishDefinition();
	Night_Duty_Definition& getNightDutyDefinition();
	const vector<std::shared_ptr<Standby_FDP_And_Rest_Definition>>& getStandbyFDPAndRestDefinitions() const;
	const vector<std::shared_ptr<Standby_DP_Definition>>& getStandbyDPDefinitions() const;
	const DP_Definition& getDPDefinition() const;

	void setApplication(int iApp);
	int getApplication() const;
	bool isCabinRank(string rank);
	vector<DBRule> getPatterRuleParams(){ return _rules8073; };
	vector<DBRule> getPatteByDaterRuleParams(){ return _rules8173; };

	vector<std::shared_ptr<max_fdp_after_delay_definition>>& getMaxFDPAfterDelayDefinitions();

	bool canAugmented = false;

	int r2109_maxPerDuty = 99, r2109_maxPerPairing=99, r2109_startTime = 0, r2109_endTime = (24 * 60 - 1);

	vector<string> fdRanks;
	//AIRPORT_RESTRICT:不允许Layover，LongTransit，AC Change的airport lists
	vector<string> noLayovers, noLongTransits, noACChanges,bases;
	//AIRPORT_RESTRICT:允许Layover，LongTransit，AC Change的airport lists
	vector<string> allowLayovers, allowLongTransits, allowACChanges;
	string restrictAllAirportInLayover , restrictAllAirportInLongTransit , restrictAllAirportInACChange ;
	//AIRPORT_RESTRICT
	
	//7264 CHECK_SCH_TIME_ABNL_FOR_EVA_FD 需要按计划时间进行检查航班的机型
	set<string> schTimeCheckFleets;

	long_transit* getLongTransit(Segment*& segment1, Segment*& segment2);
	long_transit* getTransit(Segment*& segment1, Segment*& segment2);
	bool isLongTransit(const Duty* duty);
	bool isTransit(const Duty* duty);
	int getLongTransitRest(vector<Segment *> segments);
	//int getLongTransitBrief(Segment*& segment1, Segment*& segment2);
	//int getLongTransitDebrief(Segment*& segment1, Segment*& segment2);
	void SetLongTransitBriefAndDebriefManday(vector<Segment *> segments, vector<SharedPtr<mandayTimes>> result);
	void calculateSegPickUpAndDropOff(Segment* segment, vector<DBAirport> * airportList);

private:
	static bool matchLongTransitMaxTurnTime(const long transitMins, const long_transit* longTransit);
	void loadRuleParams_internal(SharedPtr<CrewDataContext> _data);
	
	// 静态成员变量,提供全局惟一的一个实例
	static RuleParams m_pStatic;
	static RuleParams m_pStaticOfP, m_pStaticOfC, m_pStaticOfA;//division分别为P,C,A
	static ThreadLocal<string> _division;
	RuleParams();
	~RuleParams();
	int	_application = ROSTER_EDITOR;
	//FDP calculation logic
	int _FDP_Include_CO = 0;
	int _FDP_Include_LASTDHD = 0;
	bool isUseHistoryBlk = false;
	map<string, int> _probations;
	Local_Night_Definition localnight;
	WOCL_Definition wocl_definition;
	Early_Start_Definition earlyStart;
	Late_Finish_Definition lateFinish;
	Night_Duty_Definition nightDuty;
	vector<std::shared_ptr<Standby_FDP_And_Rest_Definition>> standbyFDPAndRestDefinitions;
	vector<std::shared_ptr<Standby_DP_Definition>> standbyDPDefinitions;
	DP_Definition dpDefinition;//PR计算DP使用

	void SetFDP_CO(int iMode);
	void SetFDP_LAST_DHD(int iMode);
	//vector<string> daysOff;
	vector<string> restAssignments,standbyAssignments;
	map<string,bool> _ranks;
	vector<DBRule> _rules8073;
	vector<DBRule> _rules8173;

	vector<std::shared_ptr<max_fdp_after_delay_definition>> _maxFDPAfterDelayDefinitions;

	map<string, std::shared_ptr<ASSIGNMENT>> _assignmentNameMap;
	
};

#endif//RULE_PARAMETERS_H
