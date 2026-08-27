#include "LocationMatchUtils.h"

#include <algorithm>
#include <cctype>

#include "StringUtil.h"
#include "../constant/Constants.h"

namespace {

bool isAllToken(const std::string& trimmed) {
    return trimmed.empty() || trimmed == "*" || trimmed == RuleParamConstant::ALL ||
           trimmed == RuleParamConstant::IGNORED || trimmed == RuleParamConstant::IGNORED_2;
}

std::string normalizeUpperTrim(const std::string& value) {
    return strToUpper(trim(value));
}

struct ExprParser {
    explicit ExprParser(std::string input) : _s(std::move(input)) {}

    LocationMatchUtils::LocationExpr ParseExpr() { return parseOr(); }

private:
    static LocationMatchUtils::LocationExpr makeInvalidExpr() {
        LocationMatchUtils::LocationExpr expr;
        expr.type = LocationMatchUtils::LocationExpr::Type::Invalid;
        return expr;
    }

    static bool isEmptyOperand(const LocationMatchUtils::LocationExpr& expr) {
        return expr.type == LocationMatchUtils::LocationExpr::Type::Invalid;
    }

    LocationMatchUtils::LocationExpr parseOr() {
        LocationMatchUtils::LocationExpr lhs = parseDiff();
        skipWs();
        while (peek() == '|') {
            consume();
            LocationMatchUtils::LocationExpr rhs = parseDiff();
            if (isEmptyOperand(lhs)) {
                lhs = std::move(rhs);
                skipWs();
                continue;
            }
            if (isEmptyOperand(rhs)) {
                skipWs();
                continue;
            }

            LocationMatchUtils::LocationExpr parent;
            parent.type = LocationMatchUtils::LocationExpr::Type::Or;
            parent.children.reserve(2);
            parent.children.push_back(std::move(lhs));
            parent.children.push_back(std::move(rhs));
            lhs = std::move(parent);
            skipWs();
        }
        return lhs;
    }

    LocationMatchUtils::LocationExpr parseDiff() {
        LocationMatchUtils::LocationExpr lhs = parsePrimary();
        skipWs();
        while (peek() == '~') {
            consume();
            LocationMatchUtils::LocationExpr rhs = parsePrimary();
            if (isEmptyOperand(lhs) || isEmptyOperand(rhs)) {
                lhs = makeInvalidExpr();
                skipWs();
                continue;
            }
            LocationMatchUtils::LocationExpr parent;
            parent.type = LocationMatchUtils::LocationExpr::Type::Diff;
            parent.children.reserve(2);
            parent.children.push_back(std::move(lhs));
            parent.children.push_back(std::move(rhs));
            lhs = std::move(parent);
            skipWs();
        }
        return lhs;
    }

    LocationMatchUtils::LocationExpr parsePrimary() {
        skipWs();
        if (peek() == '(') {
            consume();
            LocationMatchUtils::LocationExpr inner = parseOr();
            skipWs();
            if (peek() == ')') {
                consume();
            }
            return inner;
        }
        return parseToken();
    }

    LocationMatchUtils::LocationExpr parseToken() {
        skipWs();
        if (eof()) {
            return makeInvalidExpr();
        }
        if (peek() == '|' || peek() == '~' || peek() == ')') {
            return makeInvalidExpr();
        }

        std::string token;
        while (!eof()) {
            char c = peek();
            if (c == '|' || c == '~' || c == '(' || c == ')' || std::isspace(static_cast<unsigned char>(c))) {
                break;
            }
            token.push_back(c);
            consume();
        }

        LocationMatchUtils::LocationExpr node;
        const std::string tokenUpper = normalizeUpperTrim(token);
        if (tokenUpper == "*") {
            node.type = LocationMatchUtils::LocationExpr::Type::Any;
        } else if (tokenUpper.empty()) {
            node = makeInvalidExpr();
        } else {
            node.type = LocationMatchUtils::LocationExpr::Type::Token;
            node.tokenUpper = tokenUpper;
        }
        return node;
    }

    void skipWs() {
        while (!eof() && std::isspace(static_cast<unsigned char>(peek()))) {
            consume();
        }
    }

    char peek() const { return eof() ? '\0' : _s[_pos]; }
    void consume() {
        if (!eof()) {
            ++_pos;
        }
    }
    bool eof() const { return _pos >= _s.size(); }

    std::string _s;
    std::size_t _pos{0};
};

}  // namespace

bool LocationMatchUtils::LocationExpr::MatchesAirport(const std::string& airportCode, const CrewDataContext* dbData) const {
    if (type == Type::Invalid) {
        return false;
    }
    if (type == Type::Any) {
        return true;
    }
    if (airportCode.empty()) {
        return false;
    }

    if (type == Type::Token) {
        return LocationMatchUtils::MatchesLocationToken(tokenUpper, airportCode, dbData);
    }

    if (type == Type::Or) {
        for (const auto& child : children) {
            if (child.MatchesAirport(airportCode, dbData)) {
                return true;
            }
        }
        return false;
    }

    if (type == Type::Diff) {
        if (children.size() != 2) {
            return false;
        }
        return children[0].MatchesAirport(airportCode, dbData) && !children[1].MatchesAirport(airportCode, dbData);
    }

    return false;
}

LocationMatchUtils::LocationExpr LocationMatchUtils::LocationExpr::Parse(const std::string& rawValue) {
    const std::string normalized = trim(rawValue);
    if (isAllToken(normalized)) {
        return LocationExpr{};
    }
    ExprParser parser(normalized);
    return parser.ParseExpr();
}

bool LocationMatchUtils::LocationSet::MatchesAirport(const std::string& airportCode,
                                                     const CrewDataContext* dbData) const {
    if (allowAny) {
        return true;
    }
    if (airportCode.empty()) {
        return false;
    }
    for (const auto& tokenUpper : tokens) {
        if (LocationMatchUtils::MatchesLocationToken(tokenUpper, airportCode, dbData)) {
            return true;
        }
    }
    return false;
}

LocationMatchUtils::LocationSet LocationMatchUtils::ParseLocationSet(const std::string& rawValue) {
    LocationSet result{};
    std::string normalized = trim(rawValue);
    if (normalized.empty() ||
        normalized == RuleParamConstant::ALL ||
        normalized == RuleParamConstant::IGNORED ||
        normalized == RuleParamConstant::IGNORED_2) {
        result.allowAny = true;
        return result;
    }

    result.allowAny = false;
    std::vector<std::string> tokens;
    split(normalized.c_str(), '|', tokens);
    for (const auto& token : tokens) {
        const std::string upper = NormalizeTokenUpper(token);
        if (upper.empty() || upper == RuleParamConstant::ALL) {
            continue;
        }
        result.tokens.push_back(upper);
    }
    if (result.tokens.empty()) {
        result.allowAny = true;
    }
    return result;
}

bool LocationMatchUtils::MatchesLocationToken(const std::string& tokenUpper,
                                              const std::string& airportCode,
                                              const CrewDataContext* dbData) {
    if (tokenUpper.empty() || tokenUpper == RuleParamConstant::ALL) {
        return true;
    }

    if (tokenUpper.size() == 3) {
        return tokenUpper == airportCode;
    }

    if (dbData == nullptr) {
        return false;
    }
    const auto it = dbData->airportCodeMap.find(airportCode);
    if (it == dbData->airportCodeMap.end() || it->second == nullptr) {
        return false;
    }

    const DBAirport* airport = it->second;
    if (tokenUpper.size() == 2) {
        return tokenUpper == std::string(airport->country);
    }

    if (tokenUpper.size() == 4 && tokenUpper[0] == 'R') {
        const std::string regionUpper = tokenUpper.substr(1);
        return regionUpper == airport->category;
    }

    if (tokenUpper.size() == 4 && tokenUpper[0] == 'C') {
        // IATA city code: e.g., "CLON" matches LHR/LGW/LCY when DBAirport.city is "LON".
        const std::string cityUpper = tokenUpper.substr(1);
        return cityUpper == std::string(airport->city);
    }

    return false;
}

std::string LocationMatchUtils::NormalizeTokenUpper(const std::string& token) {
    return strToUpper(trim(token));
}
