/**
 * @file CalculateMaxDutyTimeForPRRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-07-10
**/

#ifndef _CALCULATEMAXDUTYTIMEFORPRRULEPARAM_H_
#define _CALCULATEMAXDUTYTIMEFORPRRULEPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>

class CalculateMaxDutyTimeForPRRule;

class CalculateMaxDutyTimeForPRRuleParam : public RuleParam {
friend class CalculateMaxDutyTimeForPRRule;
private:
    explicit CalculateMaxDutyTimeForPRRuleParam(const Rule* rule):RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 7300;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 11;

    enum class ParamLocation {
		COMPOSITIONS = 1,
		OPTIONS = 2,
		AUGMENTED = 3,
		NUMBER_OF_OPERATING_CREW = 4,
		OPERATING_AIRPORTS = 5,
		OPERATING_FLEETS = 6,
		SUB_OPERATING_FLEETS = 7,
		DUTY_ASSIGNMENTS = 8,
		INCLUDE_DHD_FLIGHTS = 9,
		OVERRIDEABLE = 10,
		MAX_DP = 11,
		SEVERITY = 12
    };

	//任务环机组人员配比方案。多个值使用“|”分隔并支持*通配
	vector<std::string> _compositions{};

	//配比选项。多个值使用“|”分隔并支持*通配
	vector<int> _compositionOptions{};

	//是否属于加强组。取值：Y/N。注：预留给PO的信息，RULE暂时无用
	std::shared_ptr<bool> _isAugmented{ nullptr };

	//飞行航班Crew的数量。支持通配符*，表示忽略该参数。注：不包括非必要成员岗位，不包括DHD航段。
	std::shared_ptr<int> _numOfOperatingCrew{ nullptr };

	//飞行航班的机场列表。多个值使用“|”分隔并支持*通配。注：不包括DHD航段。
	vector<std::string> _operatingAirports{};

	//飞行航班的机型列表。多个值使用“|”分隔并支持*通配。注：不包括DHD航段。
	vector<std::string> _operatingFleets{};

	//飞行航班的子机型列表。多个值使用“|”分隔并支持*通配。注：不包括DHD航段。
	vector<std::string> _subOperatingFleets{};

	//Duty的任务类型。多个值使用“|”分隔并支持*通配
	vector<std::string> _dutyAssignments{};

	//Duty是否允许包括DHD航班。取值：Y/N。true:Duty Segment可以包含DHD也可以不包含DHD；false：Duty包含不能包含DHD
	std::shared_ptr<bool> _isIncludeDHDFlight{ nullptr };

	//Duty的MaxDP是否覆盖。取值：Y/N。Y - 不管其他Rule设置的Max DP是多少，取该值。N/空 - 缺省逻辑，取最严格的限制，即各个Rule设置值中最小的
	std::shared_ptr<bool> _isOverrideable{ nullptr };
	

	//最大DP时间限制。格式：HH:mm
	int _maxDP{};


    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//匹配Duty的配比和Option
	bool MatchCompositionOption(const Duty& duty) const;

	//匹配Duty的任务类型
	bool MatchDutyAssignments(const Duty& duty) const;

	//匹配Duty中Segment是否满足如下条件：是否允许包括DHD航班、飞行航班的机场列表、飞行航班的子机型列表
	bool MatchOperatingParam(const Duty& duty) const;

	//匹配飞行航班Crew的数量
	bool MatchNumOfOperatingCrew(const Duty& duty) const;

	//匹配Segment的DHD条件
	bool MatchIncludeDHDFlight(const Duty& duty) const;
private:

	//匹配飞行航班的机场列表
	bool MatchOperatingAirports(const Segment* segment) const;

	//匹配飞行航班的机型列表和子机型
	bool MatchOperatingFleetsAndSubFleets(const Segment* segment) const;


public:
	bool MatchParam(const Duty& duty) const;

};

#endif //_CALCULATEMAXDUTYTIMEFORPRRULEPARAM_H_
