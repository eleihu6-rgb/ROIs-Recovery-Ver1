#ifndef _LOCATION_MATCH_UTILS_H_
#define _LOCATION_MATCH_UTILS_H_

#include <string>
#include <vector>

#include "CrewDB.h"

class LocationMatchUtils {
public:
    struct LocationExpr {
        enum class Type {
            Invalid,
            Any,
            Token,
            Or,
            Diff
        };

        Type type{Type::Any};
        std::string tokenUpper{};
        std::vector<LocationExpr> children{};

        bool MatchesAirport(const std::string& airportCode, const CrewDataContext* dbData) const;

        static LocationExpr Parse(const std::string& rawValue);
    };

    struct LocationSet {
        bool allowAny{true};
        std::vector<std::string> tokens{};

        bool MatchesAirport(const std::string& airportCode, const CrewDataContext* dbData) const;
    };

    static LocationSet ParseLocationSet(const std::string& rawValue);

    static bool MatchesLocationToken(const std::string& tokenUpper,
                                     const std::string& airportCode,
                                     const CrewDataContext* dbData);

private:
    static std::string NormalizeTokenUpper(const std::string& token);
};

#endif  // _LOCATION_MATCH_UTILS_H_

