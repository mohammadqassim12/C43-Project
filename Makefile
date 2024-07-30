#
# Compiler
#
CXX = g++

#
# Compiler flags
#
CXXFLAGS = -std=c++17 -Wall -O3

#
# Include and library directories
#
INCLUDES = -I/opt/homebrew/include
LIBS = -L/opt/homebrew/lib -lpqxx -lpq

#
# Source files
#
SRCS = main.cpp user.cpp portfolio.cpp stocklist.cpp stock.cpp social.cpp review.cpp

#
# Object files
#
OBJS = $(SRCS:.cpp=.o)

#
# Output executable
#
TARGET = pgsample

#
# Default target
#
all: $(TARGET)

#
# Rule to build the target executable
#
$(TARGET): $(OBJS)
	$(CXX) $(CXXFLAGS) $(INCLUDES) -o $(TARGET) $(OBJS) $(LIBS)

#
# Rule to build object files
#
%.o: %.cpp
	$(CXX) $(CXXFLAGS) $(INCLUDES) -c $< -o $@

#
# Clean rule to remove the compiled executable and object files
#
clean:
	rm -f $(TARGET) $(OBJS)
