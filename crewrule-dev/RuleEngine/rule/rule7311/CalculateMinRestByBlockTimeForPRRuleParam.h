/**
 * @file CalculateMinRestByBlockTimeForPRRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _CALCULATEMINRESTBYBLOCKTIMEFORPRRULEPARAM_H_
#define _CALCULATEMINRESTBYBLOCKTIMEFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMinRestByBlockTimeForPRRule;
class LimitMinRestByBlockTimeForPRRule;

class CalculateMinRestByBlockTimeForPRRuleParam : public RuleParam {
	friend class CalculateMinRestByBlockTimeForPRRule;
	friend class LimitMinRestByBlockTimeForPRRule;
private:
	explicit CalculateMinRestByBlockTimeForPRRuleParam(const Rule* rule) :RuleParam(rule) {};

	constexpr static unsigned int RuleFuncId = 7311;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 1;

	enum class ParamLocation {
		BASES = 1,
		COMPOSITIONS = 2,
		DUTY_TYPE = 3,
		DUTY_ASSIGNMENTS = 4,
		NO_OF_SECTORS = 5,
		WORKING_ASSIGNMENT_GROUPS = 6,
		IS_LINE_TRAINING = 7,
		FLIGHT_NO = 8,
		EXCLUDE_FLIGHT_NO = 9,
		BLH_RANGES = 10,
		IS_LAYOVER_REST = 11,
		BASE_REST = 12,
		REST_MULTIPLIED = 13
	};

	//任务环的基地列表，支持*和|分开多个设置
	std::vector<std::string> _bases{};

	//任务的配比，支持*和|分开多个设置
	std::vector<std::string> _compositions{};
	
	//任务类型，D、I、R之一，或者*
	vector<std::string> _dutyTypes{};

	//任务的Assignment列表，支持*和|分开多个设置。注：要支持地面任务的Assignment
	std::vector<std::string> _dutyAssignments{};

	//Duty内航班数量（包括DHD），支持*或数字，格式：n-m，取值范围：[n,m]。默认为*（向下兼容）
	std::string _noOfSectors{};
	int _noOfSectorsLower{ 0 };
	int _noOfSectorsUpper{ 0 };

	//工作任务的Assignment Groups列表，支持 | 分隔多个设置和 * 通配符
	std::vector<std::string> _workingAssignmentGroups{};

	// Y/N或者*，是否Line Training培训任务
    shared_ptr<bool> _isLineTraining{ nullptr };

	//航班号列表，支持*和|分开多个设置, 需设置Airline code+航班号
	std::vector<std::string> _flightNo{};

	//排除的航班列表，支持*和|分开多个设置。需设置Airline code+航班号
	std::vector<std::string> _excludeFlightNo{};

	//HH:MM - HH:MM，Duty内全部FLY航班总飞时的区间范围
	std::string _blhRanges{};

	//Y/N , 休息要求在基地还是外站，缺省为基地休息要求
	std::string _isLayoverRest{};

	//最小基准休息时间
	int _minBaseRest{};

	//倍数设置，Double类型，如0.5，2.5。不设置即忽略该条件，只根据Base Rest设置休息时间。缺省向上取整。
	std::string _restMultiplied{};

	//Duty的MaxDP是否覆盖。取值：Y/N。Y - 不管其他Rule设置的Max DP是多少，取该值。N/空 - 缺省逻辑，取最严格的限制，即各个Rule设置值中最小的
	std::shared_ptr<bool> _isOverrideable{ nullptr };

	//Duty标签列表，支持 * 和 | 分开的多个设置，其中为空代表无论Duty是否有Duty标签，还是遵循缺省逻辑（多个Rest Rule的最大值作为最终Min Rest需求）。设置 * 或者Duty满足该参数条件时，不管原先Min Rest是多少，该Rule设置Min Rest属于最终Min Rest
	std::string _overrideDutyAttributes{};
	std::vector<std::string> _overrideDutyAttributesVec{};

	void ParseParam(const DBRule& dbRule);


public:

	enum class WarnCode {
		NO_WARN = 0, //无告警
	};

	bool MatchRule(const Duty& duty, const ROSTER* roster, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) const;

	bool MatchBase(const string& base) const;

	bool MatchAssignments(const string& assignment) const;

	bool MatchNoOfSectors(const Duty& duty) const;

	bool MatchComposotion(const Duty& duty) const;

	bool MatchDutyType(const Duty& duty) const;

	bool MatchLineTraining(const Duty& duty, const map<long long, vector<std::shared_ptr<TmCourse>>>& flightCourseMap) const;

	bool MatchLayoverRest(const Duty& duty) const;

	bool MatchFlightNo(const Duty& duty) const;

	bool MatchExcludeFlightNo(const Duty& duty) const;

	bool MatchBLHRange(const int& blh) const;

	int GetMinRest(const int blh) const;

	bool MatchDutyAttributes(const Duty& duty) const;
};

#endif //_CALCULATEMINRESTBYBLOCKTIMEFORPRRULEPARAM_H_
