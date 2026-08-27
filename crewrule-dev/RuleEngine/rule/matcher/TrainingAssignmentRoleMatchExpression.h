#pragma once

#include <vector>
#include "matcher/MatchExpression.h"

#include "CrewDB.h"
#include "UtilFunc.h"
#include "utils/StringUtils.h"
#include "utils/RosterUtils.h"


/*
* 用于匹配Assignment+Role组合场景，例如：GND必须IP执行
* 格式：[ASSIGNMENT+]ROLE，[]表示可选，多个使用|分隔, *表示任意。例如：GND+IP|OW+*|*+TE|PNR.  PNR是Role
*/
template<typename T>
class TrainingAssignmentRoleMatchExpression : public MatchExpression<T> {
private:
	//std::tuple<assignment,role>(能包含的Item)
	std::vector<std::tuple<std::string, std::string>> _includeAssignmentRoles{};

	//std::tuple<assignment,role>(能包含的Item)
	std::vector<std::tuple<std::string, std::string>> _excludedAssignmentRoles{};

	std::vector<std::tuple<std::string, std::string>> GetTrainingAssignmentRoleForRoster(const Activity& activity, const vector<long long>& flightIds) const {
		const ROSTER& roster = static_cast<const ROSTER&>(activity);
		const std::shared_ptr<CrewDataContext>& dbData = this->GetDataContext();
		return RosterUtils::GetTrainingAssignmentRoleByRoster(roster, flightIds, dbData);
	}

	void parseAssignmentRoles(std::vector<std::tuple<std::string, std::string>>& assignmentRoles, const string& text) {
		std::vector<std::string> splitstrs;
		split(text, '|', splitstrs);
		for (auto& splitstr : splitstrs) {
			std::vector<std::string> splitstrs2;
			split(splitstr, '+', splitstrs2);
			if (splitstrs2.size() == 1) {
				assignmentRoles.emplace_back(std::make_tuple("*", splitstrs2[0]));
			}
			else if (splitstrs2.size() >= 2) {
				assignmentRoles.emplace_back(std::make_tuple(splitstrs2[0], splitstrs2[1]));
			}
		}
	}
protected:
	bool MatchExcludedItems(const std::vector<std::tuple<std::string, std::string>>& items, const vector<long long>& flightIds) const {
		if (items.empty() || _excludedAssignmentRoles.empty()) {
			return true;
		}

		for (auto& item : items) {
			auto& itemAssignment = std::get<0>(item);
			auto& itemRole = std::get<1>(item);
			for (auto& assignmentRole : _excludedAssignmentRoles) {
				auto& assignment = std::get<0>(assignmentRole);
				auto& role = std::get<1>(assignmentRole);

				if ((assignment == RuleParamConstant::ALL || itemAssignment == RuleParamConstant::ALL || assignment == itemAssignment)
					&& (role == RuleParamConstant::ALL || itemRole == RuleParamConstant::ALL || role == itemRole)) {
					return false;
				}
			}
		}
		return true;
	}

	bool MatchIncludedItems(const std::vector<std::tuple<std::string, std::string>>& items, const vector<long long>& flightIds) const {
		if (_includeAssignmentRoles.empty()) {
			return true;
		}
		for (auto& item : items) {
			auto& itemAssignment = std::get<0>(item);
			auto& itemRole = std::get<1>(item);
			for (auto& assignmentRole : _includeAssignmentRoles) {
				auto& assignment = std::get<0>(assignmentRole);
				auto& role = std::get<1>(assignmentRole);

				if ((assignment == RuleParamConstant::ALL || itemAssignment == RuleParamConstant::ALL || assignment == itemAssignment)
					&& (role == RuleParamConstant::ALL || itemRole == RuleParamConstant::ALL || role == itemRole)) {
					return true;
				}
			}
		}
		return false;
	}

	virtual bool ParseExpression(const std::string& expression) override {
		if (expression == RuleParamConstant::ALL) {
			return true;
		}

		std::string excludedText = "";
		bool isExcludedText = StringUtils::unwrapExcludedText(expression, excludedText);
		if (isExcludedText) {
			//格式：!(A|B|C)
			parseAssignmentRoles(_excludedAssignmentRoles, excludedText);
		}
		else {
			//格式：A|B|C
			parseAssignmentRoles(_includeAssignmentRoles, expression);
		}
		return true;
	}

	virtual bool MatchImpl(const T& matchable) const override {
		return true;
	}

	/*
	* 返回值：tuple<Assignment,Role>
	*/
	std::vector<std::tuple<std::string,std::string>> GetMatchableItems(const T& matchable, const vector<long long>& flightIds) const {
		std::vector<std::tuple<std::string, std::string>> result;
		if (typeid(matchable) == typeid(ROSTER)) {
			result = GetTrainingAssignmentRoleForRoster(matchable, flightIds);
		}
		else {
			Logger::getRuleLogger()->error("error: Matchable is not ROSTER object in TrainingAssignmentRoleMatchExpression class.");
		}
		return result;
	}

	bool MatchImpl(const T& matchable, const vector<long long>& flightIds) const {
		auto matchableItems = GetMatchableItems(matchable, flightIds);
		return MatchIncludedItems(matchableItems, flightIds) && MatchExcludedItems(matchableItems, flightIds);
	}

public:

	TrainingAssignmentRoleMatchExpression() : MatchExpression<T>(MatchExpression<T>::MatchType::MATCH_IN) {

	}

	bool Match(const T& matchable, const vector<long long>& flightIds) const {
		if (this->Ignored()) {
			return true;
		}
		return MatchImpl(matchable, flightIds);
	};

	virtual bool Ignored() const override {
		return _includeAssignmentRoles.empty() && _excludedAssignmentRoles.empty();
	}
};

